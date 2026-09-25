"""다가오는 행사를 단건 예보 조립기로 계산하고 요약·전체 예보·품질 보고서를 발행한다."""

import argparse
import fcntl
import io
import os
import re
from collections import Counter
from datetime import date
from hashlib import file_digest, sha256
from pathlib import Path
from tempfile import TemporaryDirectory
from time import perf_counter
from typing import Any

import polars as pl
from crowdcast import paths
from crowdcast.api.assemble.artifacts import Unavailable, promoted
from crowdcast.api.assemble.forecast import predict as assemble_forecast
from crowdcast.api.assemble.http import NoObservation, event_input
from crowdcast.api.assemble.identity import canonical, identifier
from crowdcast.api.assemble.inputs import cutoff
from crowdcast.api.assemble.model import current_model
from crowdcast.api.contract import validate
from crowdcast.data.events import contract_event
from crowdcast.features.availability import publication_date
from fastapi import HTTPException

# 빈 실행도 같은 열과 자료형을 갖도록 계약 요약과 내부 감사 열을 고정한다.
SUMMARY_SCHEMA = {
    **dict.fromkeys("eventId forecastId name type startsAt endsAt sigunguCode sigunguName".split(),
                   pl.String),
    "lat": pl.Float64, "lng": pl.Float64,
    **dict.fromkeys(("level", "peakP10", "peakP50", "peakP90"), pl.Int64),
    "pOver1000": pl.Float64,
    "ood": pl.Boolean,
}
AUDIT_SCHEMA = {
    **dict.fromkeys(("runId", "modelVersion", "modelVerdict", "date_source", "date_available_at"), pl.String),
    "baselineAvailable": pl.Boolean,
}
WINDOW_START, WINDOW_END = date(2026, 9, 29), date(2026, 11, 30)


# 행사 행 순서에 무관한 입력 해시와 실제 기준일·관측 파일·모델을 하나의 실행으로 식별한다.
def run_identifier(frame: pl.DataFrame, start: date, end: date, pointer: dict[str, Any]) -> str:
    rows = sorted(frame.select(sorted(frame.columns)).write_ndjson().splitlines())
    hashes = {"events": sha256("\n".join(rows).encode()).hexdigest()}
    for name in ("labels", "region_daily"):
        path = paths.PROCESSED / f"{name}.parquet"
        if path.exists():
            with path.open("rb") as stream:
                hashes[name] = file_digest(stream, "sha256").hexdigest()
    days = frame.filter(pl.col("start").is_between(start, end))["start"].unique().to_list()
    cutoffs = sorted({cutoff({"startsAt": f"{day}T00:00:00+09:00"}).isoformat() for day in days})
    model = {key: pointer[key] for key in ("modelVersion", "runId", "verdict")}
    return identifier("batch", {"inputs": hashes, "from": str(start), "to": str(end),
                                "asOf": cutoffs, "model": model})


# 세 임시 파일과 복구본을 먼저 준비하고 교체 도중 실패하면 직전 발행 상태로 되돌린다.
def publish(outputs: dict[str, bytes]) -> None:
    with TemporaryDirectory(prefix=".upcoming-", dir=paths.PROCESSED) as directory:
        staging = Path(directory)
        replaced = []
        for name, content in outputs.items():
            (staging / name).write_bytes(content)
            target = paths.PROCESSED / name
            if target.exists():
                (staging / f"{name}.previous").write_bytes(target.read_bytes())
        try:
            for name in outputs:
                os.replace(staging / name, paths.PROCESSED / name)
                replaced.append(name)
        except BaseException:
            for name in reversed(replaced):
                previous = staging / f"{name}.previous"
                if previous.exists():
                    os.replace(previous, paths.PROCESSED / name)
                else:
                    (paths.PROCESSED / name).unlink()
            raise


# 표시용 인원만 Python의 기존 표시 반올림을 적용하고 확률·등급은 조립 결과 그대로 둔다.
def festival_summary(event: dict[str, Any], forecast: dict[str, Any]) -> dict[str, Any]:
    result = {
        **{key: event[key] for key in ("name", "type", "startsAt", "endsAt", "sigunguCode", "sigunguName")},
        "eventId": event["id"],
        "forecastId": forecast["id"],
        "lat": event["venue"]["lat"],
        "lng": event["venue"]["lng"],
        "level": forecast["judgment"]["level"],
        **{f"peakP{q}": round(forecast["peakConcurrent"][f"p{q}"]) for q in (10, 50, 90)},
        "pOver1000": next(p["probability"] for p in forecast["probabilities"] if p["threshold"] == 1000),
        "ood": forecast["ood"],
    }
    validate("festival-summary", result)
    return result


# 원본 필수값의 결측 조합을 한 사유로 묶어 같은 행을 중복 제외하지 않는다.
def missing_reason(row: dict[str, Any]) -> str | None:
    groups = {"날짜": ("start", "end"), "시군구": ("sigungu_code", "sido", "sigungu_name"),
              "좌표": ("lat", "lng")}
    missing = [f"{name}({','.join(fields)})" for name, keys in groups.items()
               if (fields := [key for key in keys if row.get(key) is None or row.get(key) == ""])]
    return "변환 불가: " + "; ".join(missing) if missing else None


# 쿼리와 배치 모두 역전된 날짜 범위를 조용히 빈 결과로 처리하지 않는다.
def check_range(start: date | None, end: date | None) -> None:
    if start is not None and end is not None and start > end:
        raise ValueError("from은 to보다 늦을 수 없습니다")


# 저장된 요약만 조회하고 내부 감사 열은 정본 API 계약 밖으로 내보내지 않는다.
def upcoming(start: date | None = None, end: date | None = None) -> tuple[str, list[dict[str, Any]]]:
    check_range(start, end)
    try:
        content = (paths.PROCESSED / "upcoming.parquet").read_bytes()
    except FileNotFoundError:
        raise Unavailable("다가오는 행사 예보가 아직 생성되지 않았습니다") from None
    frame = pl.read_parquet(content)
    run_id = pl.read_parquet_metadata(content)["runId"]
    if not run_id or frame["runId"].null_count() or set(frame["runId"]) - {run_id}:
        raise ValueError("다가오는 행사 요약의 runId가 일치하지 않습니다")
    days = pl.col("startsAt").str.slice(0, 10).str.to_date()
    if start is not None:
        frame = frame.filter(days >= start)
    if end is not None:
        frame = frame.filter(days <= end)
    return run_id, frame.select(list(SUMMARY_SCHEMA)).sort(
        ["level", "pOver1000", "startsAt", "eventId", "forecastId"],
        descending=[True, True, False, False, False],
    ).to_dicts()


# 이전 QC의 실행 식별자와 수를 함께 읽으며 식별자가 없던 구형 QC도 첫 전환에 허용한다.
def previous_count() -> tuple[str | None, int] | None:
    try:
        report = (paths.PROCESSED / "upcoming_qc.md").read_text(encoding="utf-8")
    except FileNotFoundError:
        return None
    match = re.search(r"^예보 수: (\d+)$", report, re.MULTILINE)
    if match is None:
        raise ValueError("직전 upcoming QC에서 예보 수를 읽을 수 없습니다")
    run = re.search(r"^runId: (\S+)$", report.split("## ")[0], re.MULTILINE)
    return (run[1] if run else None), int(match[1])


# 입력 범위·변환·관측 부재·예보 오류를 분리하고 경고를 문서 맨 위에 둔다.
def quality_report(
    start: date, end: date, counts: Counter[str], excluded: Counter[str], summaries: list[dict[str, Any]],
    pointer: dict[str, Any], previous: tuple[str | None, int] | None, first_error: str | None,
    elapsed: float, run_id: str,
) -> str:
    forecast_count = len(summaries)
    lines = []
    if previous is not None and forecast_count < previous[1] * 0.9:
        lines += [f"경고: 예보 수 {forecast_count}건이 직전 {previous[1]}건의 90% 미만입니다.", ""]
    levels = Counter(row["level"] for row in summaries)
    lines += [
        "# 다가오는 행사 예보 QC", f"runId: {run_id}",
        "중단 시 세 파일 runId가 다를 수 있음 — 읽는 쪽이 거부",
        f"직전 runId: {(previous[0] or '미기록(구형 QC)') if previous else '없음'}",
        "", f"시작일 범위(양끝 포함): {start}~{end}",
        f"모델 버전: {pointer['modelVersion']}", f"modelVerdict: {pointer['verdict']}",
        "참고용 — 담당자 검토 필수 · 순간 최대는 추정 산식 기반",
    ]
    if pointer["verdict"] == "미검증":
        lines.append("골든 사례 0건 — 사례 재현 검증 전 임시 사용")
    lines += [
        f"마스터 행 수: {counts['master']}", f"범위 밖 시작일 수: {counts['outside']}",
        f"시작일 미확정 수(전체 마스터, 범위 판정 불가): {counts['unknown_start']}",
        f"범위 내 시작일 수: {counts['window']}", f"입력 가능 수: {counts['eligible']}",
        f"예보 수: {forecast_count}", f"직전 예보 수: {previous[1] if previous else '없음'}",
        f"일정 공개일이 asOf 뒤인 행사 {counts['late_date']}건(입력으로 사용 — 06 §3)",
        f"OOD 수: {sum(row['ood'] for row in summaries)}",
        f"평시 근거 없음: {sum(not row['baselineAvailable'] for row in summaries)}",
        "NO_COMPLETE_WINDOW 등 평시 근거 부재는 예보를 막지 않음.",
        f"503 NO_OBSERVATION: {counts['no_observation']}", f"그 밖의 오류 수: {counts['errors']}",
        f"첫 오류: {first_error or '없음'}", "", "## 등급별 수",
        *[f"- 등급 {level}: {levels[level]}" for level in range(1, 5)],
        "", "## 사유별 제외 수(범위 내, 결측 조합별 중복 없음)",
        *[f"- {reason}: {count}" for reason, count in sorted(excluded.items())],
        "", "## 예보 일정 출처·공개일", "| eventId | date_source | date_available_at |", "|---|---|---|",
        *[f"| {row['eventId']} | {row['date_source'] or '미상'} | {row['date_available_at'] or '미상'} |"
          for row in summaries],
        "", f"전체 실행 시간(초): {elapsed:.3f}",
        "parquet·JSONL은 입력·기준일·모델이 같으면 같은 바이트; QC는 실행 시간·직전 수를 기록함.",
    ]
    return "\n".join(lines) + "\n"


# 행 단위 실패는 집계하고 정상 예보는 단건 API와 같은 조립·계약 검증을 거쳐 저장한다.
def run_batch(start: date = WINDOW_START, end: date = WINDOW_END) -> str:
    # 입력 조회부터 세 파일 발행까지 잠그고 종료·예외 시 핸들을 닫아 해제한다.
    with (paths.PROCESSED / ".upcoming.lock").open("w") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("다른 일괄 예보 실행 중 — 끝난 뒤 다시 실행") from None
        started = perf_counter()
        check_range(start, end)
        previous = previous_count()
        _, pointer = current_model()
        frame = pl.read_parquet(paths.PROCESSED / "events.parquet").sort("event_id", "start")
        run_id = run_identifier(frame, start, end, pointer)
        counts: Counter[str] = Counter(master=frame.height)
        excluded: Counter[str] = Counter()
        summaries: dict[str, dict[str, Any]] = {}
        forecasts: dict[str, str] = {}
        first_error = None
        for row in frame.iter_rows(named=True):
            if row["start"] is None:
                counts["unknown_start"] += 1
                continue
            if not start <= row["start"] <= end:
                counts["outside"] += 1
                continue
            counts["window"] += 1
            if reason := missing_reason(row):
                excluded[reason] += 1
                continue
            try:
                event = event_input(contract_event(row))
                published = publication_date(row.get("date_available_at"))
            except (ValueError, KeyError, HTTPException) as error:
                reason = error.detail if isinstance(error, HTTPException) else str(error)
                excluded[f"변환 불가: {reason}"] += 1
                continue
            counts["eligible"] += 1
            counts["late_date"] += int(published is not None and published > cutoff(event))
            try:
                forecast = assemble_forecast(event)
                validate("forecast", forecast)
                summary = festival_summary(event, forecast)
                content = canonical({"runId": run_id, "forecast": forecast})
                forecast_id = forecast["id"]
                if forecast_id in forecasts:
                    if forecasts[forecast_id] != content:
                        raise ValueError("같은 forecastId의 예보 내용이 다릅니다")
                    excluded["중복 forecastId"] += 1
                    continue
                summaries[forecast_id] = {
                    **summary, "runId": run_id, "modelVersion": forecast["modelVersion"],
                    "date_source": row.get("date_source"), "date_available_at": row.get("date_available_at"),
                    "modelVerdict": forecast["predictionRun"]["modelVerdict"],
                    "baselineAvailable": any(e["kind"] == "data" and e["title"] == "개최지 평시 방문"
                                             for e in forecast["evidence"]),
                }
                forecasts[forecast_id] = content
            except NoObservation:
                counts["no_observation"] += 1
                excluded["503 NO_OBSERVATION"] += 1
            except Exception as error:
                counts["errors"] += 1
                excluded[f"그 밖의 오류: {type(error).__name__}"] += 1
                if first_error is None:
                    detail = next(iter(str(error).splitlines()), "메시지 없음")
                    first_error = f"{event['id']}: {type(error).__name__}: {detail}"

        # 실행 중 모델·입력이 바뀌면 하나의 runId로 서로 다른 실행 자료를 발행하지 않는다.
        if promoted() != pointer or any(
            row["modelVersion"] != pointer["modelVersion"] or row["modelVerdict"] != pointer["verdict"]
            for row in summaries.values()
        ):
            raise RuntimeError("일괄 예보 도중 사용 모델 포인터가 변경되었습니다. 다시 실행하세요")
        if run_identifier(pl.read_parquet(paths.PROCESSED / "events.parquet"), start, end, pointer) != run_id:
            raise RuntimeError("일괄 예보 도중 입력이 변경되었습니다. 다시 실행하세요")
        ordered = [summaries[key] for key in sorted(summaries)]
        table = pl.from_dicts(ordered, schema={**SUMMARY_SCHEMA, **AUDIT_SCHEMA})
        buffer = io.BytesIO()
        table.write_parquet(buffer, metadata={"runId": run_id})
        report = quality_report(start, end, counts, excluded, ordered, pointer, previous, first_error,
                                perf_counter() - started, run_id)
        content = "".join(forecasts[key] + "\n" for key in sorted(forecasts)).encode()
        publish({"upcoming_forecasts.jsonl": content,
                 "upcoming.parquet": buffer.getvalue(), "upcoming_qc.md": report.encode()})
        return report


# 파이프라인의 기존 모듈 진입점에서 기본 기간 또는 명시한 시작일 범위를 실행한다.
def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from", dest="start", type=date.fromisoformat, default=WINDOW_START)
    parser.add_argument("--to", dest="end", type=date.fromisoformat, default=WINDOW_END)
    args = parser.parse_args()
    try:
        check_range(args.start, args.end)
    except ValueError as error:
        parser.error(str(error))
    print(run_batch(args.start, args.end), end="")
    return 0


# python -m 호출의 종료 코드를 파이프라인에 전달한다.
if __name__ == "__main__":
    raise SystemExit(main())
