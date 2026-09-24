"""지역 방문자 원본을 공개 시점·부모 시 표시와 함께 중단 가능한 Parquet으로 수집한다."""

import argparse
import calendar
import hashlib
import io
import json
from collections.abc import Iterable, Iterator
from datetime import date, timedelta
from pathlib import Path

import pandera.polars as pa
import polars as pl

from crowdcast.data.call_ledger import CallLimitReached, atomic_write, file_lock, korea_today
from crowdcast.data.crosswalk import PARENT_CITY_CODES, align_to_2025
from crowdcast.data.datago_client import ApiPage, DataGoClient, DataGoError, safe_error
from crowdcast.paths import PROCESSED

# docs/plan/06 §3의 9/25 갱신: 관측 반영 약 31일에 여유를 둬 누수를 막는다.
VISITORS_LAG_DAYS = 35
TOU_DIV = {"1": "현지인", "2": "외지인", "3": "외국인"}
KEY = ["sigungu_code", "date", "tou_div"]
DTYPES = {
    "sigungu_code": pl.String,
    "sigungu_name": pl.String,
    "date": pl.Date,
    "tou_div": pl.String,
    "visitors": pl.Float64,
    "is_parent_city": pl.Boolean,
    "available_at": pl.Date,
    "source_hash": pl.String,
}
RAW_DTYPES = DTYPES.copy()
DTYPES.update(raw_sigungu_code=pl.String, code_system=pl.Int32, continuity_break=pl.Boolean)
REGION_SCHEMA = pa.DataFrameSchema(
    {
        "sigungu_code": pa.Column(pl.String, pa.Check.str_matches(r"^\d{5}$")),
        "sigungu_name": pa.Column(pl.String, pa.Check.str_length(min_value=1)),
        "date": pa.Column(pl.Date),
        "tou_div": pa.Column(pl.String, pa.Check.isin(list(TOU_DIV.values()))),
        "visitors": pa.Column(pl.Float64, pa.Check.ge(0)),
        "is_parent_city": pa.Column(pl.Boolean),
        "available_at": pa.Column(pl.Date),
        "source_hash": pa.Column(pl.String, pa.Check.str_matches(r"^[a-f0-9]{64}$")),
    },
    unique=KEY,
    strict=True,
)
RAW_SCHEMA = REGION_SCHEMA
REGION_SCHEMA = REGION_SCHEMA.add_columns(
    {
        "raw_sigungu_code": pa.Column(pl.String, pa.Check.str_matches(r"^\d{5}$")),
        "code_system": pa.Column(pl.Int32, pa.Check.isin([2025, 2026])),
        "continuity_break": pa.Column(pl.Boolean),
    }
)


# 공급자가 아직 제공하지 않은 날짜는 완료로 표시하지 않고 재개 가능한 중단으로 알린다.
class IncompleteVisitors(DataGoError):
    pass


# API 구분 코드로 한국어 범주를 만들고 소수 추정 인원을 반올림하지 않는다.
def normalize_visitors(pages: Iterable[ApiPage]) -> pl.DataFrame:
    rows = []
    try:
        for page in pages:
            for item in page.items:
                observed = date.fromisoformat(str(item["baseYmd"]))
                code = str(item["signguCode"])
                rows.append(
                    {
                        "sigungu_code": code,
                        "sigungu_name": item["signguNm"],
                        "date": observed,
                        "tou_div": TOU_DIV[str(item["touDivCd"])],
                        "visitors": float(item["touNum"]),
                        "is_parent_city": code in PARENT_CITY_CODES,
                        "available_at": observed + timedelta(days=VISITORS_LAG_DAYS),
                        "source_hash": page.source_hash,
                    }
                )
    except (ValueError, KeyError, TypeError):
        raise DataGoError("방문자 필수 필드·날짜·구분 코드 오류") from None

    # 고유 키와 수치 범위를 검증해 잘못된 원본을 완료 구간으로 기록하지 않는다.
    frame = pl.DataFrame(rows, schema=RAW_DTYPES)
    RAW_SCHEMA.validate(frame)
    if frame.filter(~pl.col("visitors").is_finite()).height:
        raise DataGoError("유한하지 않은 방문자 수")
    frame = align_to_2025(frame).select(list(DTYPES))
    REGION_SCHEMA.validate(frame)
    return frame.sort(KEY)


# 완료된 날짜를 제외하고 월 경계를 넘지 않는 연속 구간을 만든다.
def pending_intervals(start: date, end: date, completed: set[date]) -> Iterator[tuple[date, date]]:
    current = start
    while current <= end:
        if current in completed:
            current += timedelta(days=1)
            continue
        first = current
        last = min(
            end, date(current.year, current.month, calendar.monthrange(current.year, current.month)[1])
        )
        while current < last and current + timedelta(days=1) not in completed:
            current += timedelta(days=1)
        yield first, current
        current += timedelta(days=1)


# 산출물 해시가 일치하는 체크포인트만 신뢰해 부분 저장·파일 삭제에서 복구한다.
def read_progress(output: Path) -> tuple[pl.DataFrame, set[date], set[date]]:
    if not output.exists():
        return pl.DataFrame(schema=DTYPES), set(), set()
    raw = output.read_bytes()
    frame = pl.read_parquet(io.BytesIO(raw))
    legacy = set(frame.columns) == set(RAW_DTYPES)
    if legacy:
        RAW_SCHEMA.validate(frame)
        frame = align_to_2025(frame).select(list(DTYPES)).sort(KEY)
    REGION_SCHEMA.validate(frame)
    checkpoint = output.with_suffix(".progress.json")
    completed: set[date] = set()
    unavailable: set[date] = set()
    try:
        if checkpoint.exists():
            progress = json.loads(checkpoint.read_bytes())
            if progress["parquet_sha256"] == hashlib.sha256(raw).hexdigest():
                completed = {date.fromisoformat(day) for day in progress["completed_dates"]}
                for interval in progress.get("unavailable_intervals", []):
                    first, last = date.fromisoformat(interval["from"]), date.fromisoformat(interval["to"])
                    unavailable.update(first + timedelta(days=n) for n in range((last - first).days + 1))
    except (ValueError, KeyError, TypeError):
        raise DataGoError("방문자 체크포인트 형식 오류") from None
    # 완료된 행도 공개 규칙이 바뀌면 재계산해 재개 시 과거 공개일을 남기지 않는다.
    corrected = frame.with_columns(
        (pl.col("date") + pl.duration(days=VISITORS_LAG_DAYS)).alias("available_at")
    )
    changed = not frame.equals(corrected)
    frame = corrected
    completed.intersection_update(frame["date"].to_list())
    unavailable.difference_update(completed)
    if legacy or changed:
        save_progress(output, frame, completed, unavailable)
    return frame, completed, unavailable


# 공개 전 날짜를 연속 구간으로 묶어 완료 날짜와 별도로 기록한다.
def unavailable_intervals(days: set[date]) -> list[dict[str, str]]:
    intervals: list[dict[str, str]] = []
    for day in sorted(days):
        if intervals and date.fromisoformat(intervals[-1]["to"]) + timedelta(days=1) == day:
            intervals[-1]["to"] = day.isoformat()
        else:
            intervals.append({"from": day.isoformat(), "to": day.isoformat()})
    return intervals


# Parquet을 먼저 확정하고 해시가 든 완료 날짜 목록을 나중에 저장한다.
def save_progress(
    output: Path, frame: pl.DataFrame, completed: set[date], unavailable: set[date] | None = None
) -> None:
    buffer = io.BytesIO()
    frame.write_parquet(buffer, compression="zstd")
    raw = buffer.getvalue()
    atomic_write(output, raw)
    progress = {
        "parquet_sha256": hashlib.sha256(raw).hexdigest(),
        "completed_dates": [day.isoformat() for day in sorted(completed)],
        "unavailable_intervals": unavailable_intervals((unavailable or set()) - completed),
        "visitors_lag_days": VISITORS_LAG_DAYS,
    }
    atomic_write(output.with_suffix(".progress.json"), json.dumps(progress, sort_keys=True).encode())


# 모든 페이지가 확보되면 실제 받은 날짜만 확정하고 누락 날짜를 남겨 다음 실행에서 재개한다.
def collect_visitors(
    client: DataGoClient, start: date, end: date, *, output: Path | None = None
) -> pl.DataFrame:
    if start < date(2018, 1, 1) or start > end or end > korea_today():
        raise ValueError("수집 범위는 2018-01-01부터 오늘까지여야 합니다")
    output = output if output is not None else PROCESSED / "region_daily.parquet"
    with file_lock(output.with_suffix(".lock")):
        frame, completed, unavailable = read_progress(output)
        for first, last in pending_intervals(start, end, completed):
            params = {"startYmd": first.strftime("%Y%m%d"), "endYmd": last.strftime("%Y%m%d")}
            try:
                incoming = normalize_visitors(client.pages("visitors", params, num_rows=1000))
            except DataGoError as exc:
                raise DataGoError(f"방문자 요청 {first}~{last}: {exc}") from None
            expected = {first + timedelta(days=n) for n in range((last - first).days + 1)}
            observed = set(incoming["date"].to_list())
            if observed - expected:
                raise DataGoError(
                    f"방문자 요청 {first}~{last}: 요청 범위 밖 날짜 {sorted(observed - expected)}"
                )
            if observed:
                frame = pl.concat([frame, incoming]).unique(subset=KEY, keep="last").sort(KEY)
                completed.update(observed)
            unavailable.update(expected - observed)
            unavailable.difference_update(completed)
            save_progress(output, frame, completed, unavailable)
            if missing := sorted(expected - observed):
                days = ", ".join(day.isoformat() for day in missing)
                raise IncompleteVisitors(
                    f"방문자 요청 {first}~{last}: 수신 {incoming.height}행, "
                    f"확보 {len(observed)}일 저장; 미제공 날짜 {days}; 누락 날짜는 미완료"
                )
        return frame.filter(pl.col("date").is_between(start, end))


# 한도·미제공 날짜는 종료 코드 2로 알리고 오류 종류·사유는 인증키를 가려 출력한다.
def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="지역 방문자 API 벌크 수집·재시작")
    parser.add_argument("--from", dest="start", required=True, type=date.fromisoformat)
    parser.add_argument("--to", dest="end", required=True, type=date.fromisoformat)
    parser.add_argument("--max-calls", type=int, default=800)
    args = parser.parse_args(argv)
    client = None
    try:
        with DataGoClient(max_calls=args.max_calls) as client:
            try:
                frame = collect_visitors(client, args.start, args.end)
            except (CallLimitReached, IncompleteVisitors) as exc:
                print(
                    json.dumps(
                        {"status": "paused", "reason": safe_error(exc), "calls": client.ledger.calls},
                        ensure_ascii=False,
                    )
                )
                return 2
            print(
                json.dumps(
                    {
                        "status": "complete",
                        "rows": frame.height,
                        "sigungu_count": frame["sigungu_code"].n_unique(),
                        "parent_city_count": frame.filter(pl.col("is_parent_city"))[
                            "sigungu_code"
                        ].n_unique(),
                        "calls": client.ledger.calls,
                    },
                    ensure_ascii=False,
                )
            )
    except (DataGoError, ValueError, OSError, RuntimeError, pa.errors.SchemaError) as exc:
        print(
            json.dumps(
                {
                    "status": "error",
                    "error_type": type(exc).__name__,
                    "reason": safe_error(exc),
                    "calls": client.ledger.calls if client else 0,
                },
                ensure_ascii=False,
            )
        )
        return 1
    return 0


# 모듈 실행을 CLI 진입점에 연결한다.
if __name__ == "__main__":
    raise SystemExit(main())
