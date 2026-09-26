"""자료별 관측일·수집 시각과 사용 모델을 운영 최신성 계약의 행으로 조립한다."""

import json
import logging
import os
import re
from datetime import date, datetime
from typing import Any

import polars as pl
from crowdcast import paths
from crowdcast.data.call_ledger import KST, korea_today
from crowdcast.data.visitors import VISITORS_LAG_DAYS
from crowdcast.pipeline.freshness_cache import cache_status
from crowdcast.pipeline.record_privacy import public_text, record_path
from crowdcast.pipeline.run_record import PROMOTED_POINTER, fetch_history

LOGGER = logging.getLogger(__name__)


# 계약에 없는 경고·보유 연도·버전은 title에 표시하고 미수집 값은 null로 둔다.
def row(
    dataset: str,
    title: str,
    collected: str | None = None,
    observed: str | None = None,
    rows: int | None = None,
) -> dict[str, Any]:
    return {
        "datasetId": "ds-" + dataset,
        "title": public_text(title),
        "lastCollectedAt": collected,
        "lastObservedDate": observed,
        "rows": rows,
    }


# 시간대를 확인하고 문자열 정렬 대신 실제 시각으로 최신 성공을 선택한다.
def latest_time(*values: str | None) -> str | None:
    stamps = []
    for value in filter(None, values):
        stamp = datetime.fromisoformat(value)
        if stamp.tzinfo is None:
            raise ValueError("수집 시각의 시간대 누락")
        stamps.append(stamp)
    return max(stamps).astimezone(KST).isoformat() if stamps else None


# 지연은 조회일 기준으로 계산해 수집이 멈춘 뒤에도 임계일을 넘는 즉시 경고한다.
def visitors(today: date) -> dict[str, Any]:
    collected, _ = cache_status("visitors")
    collected = latest_time(collected, fetch_history()["last_success"])
    file = paths.PROCESSED / "region_daily.parquet"
    if not file.is_file():
        return row("kto-visitors-15101972", "방문자 · 관측 자료 없음", collected)
    latest, count = pl.scan_parquet(file).select(pl.col("date").max(), pl.len()).collect().row(0)
    title = "방문자 · 최신 관측 없음"
    if latest is not None:
        lag = (today - latest).days
        title = f"방문자 · 반영 지연 {lag}일 (기준 {VISITORS_LAG_DAYS}일)"
        if lag > VISITORS_LAG_DAYS:
            title += " · 경고: 반영 지연 가정 위반"
        elif lag < 0:
            title += " · 경고: 미래 관측일"
    return row("kto-visitors-15101972", title, collected, latest.isoformat() if latest else None, count)


# 보유 연도는 실제 특일 응답의 날짜에서만 모으고 완전 수집 여부를 추측하지 않는다.
def holidays() -> dict[str, Any]:
    collected, years = cache_status("holidays")
    title = "특일 · 보유 연도 " + (", ".join(map(str, sorted(years))) if years else "없음")
    return row("kasi-holidays-15012690", title, collected)


# 빈 배치도 parquet 메타데이터의 runId를 사용하며 실행 시각 대용값임을 명시한다.
def upcoming() -> dict[str, Any]:
    path = paths.PROCESSED / "upcoming.parquet"
    if not path.is_file():
        return row("upcoming", "일괄 예보 · 실행 기록 없음")
    with path.open("rb") as stream:
        stamp = datetime.fromtimestamp(os.fstat(stream.fileno()).st_mtime, KST).isoformat()
        run_id = pl.read_parquet_metadata(stream)["runId"]
        record_path(run_id)
        stream.seek(0)
        frame = pl.read_parquet(stream, columns=["runId"])
    if frame["runId"].null_count() or set(frame["runId"]) - {run_id}:
        raise ValueError("일괄 예보 실행 식별자 불일치")
    return row(
        "upcoming", f"일괄 예보 · runId {run_id} · 실행 시각 추정(파일 갱신 시각)", stamp, rows=frame.height
    )


# 후보 latest가 아닌 승격 포인터의 사용 모델만 노출한다.
def model() -> dict[str, Any]:
    pointer = paths.REPORTS / PROMOTED_POINTER
    if not pointer.is_file():
        return row("promoted-model", "사용 모델 · 승격 기록 없음")
    value = json.loads(pointer.read_bytes())
    version = value["modelVersion"]
    if not isinstance(version, str) or not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._+-]*", version):
        raise ValueError("사용 모델 버전 형식 오류")
    stamp = latest_time(value.get("promotedAt"))
    verdict = value.get("verdict", "미기록")
    return row("promoted-model", f"사용 모델 · {version} · 검증 상태 {verdict}", stamp)


# 일부 자료가 손상되어도 다른 자료의 최신성은 유지하고 해당 행에 오류를 표시한다.
def freshness(today: date | None = None) -> list[dict[str, Any]]:
    today = today or korea_today()
    readers = (
        ("kto-visitors-15101972", "방문자", lambda: visitors(today)),
        (
            "kto-tourapi-15101578",
            "TourAPI",
            lambda: row("kto-tourapi-15101578", "TourAPI", cache_status("festivals", "places")[0]),
        ),
        (
            "weather",
            "기상청",
            lambda: row(
                "weather",
                "기상청",
                cache_status("ultra_now", "short_term", "mid_land", "mid_temperature", weather=True)[0],
            ),
        ),
        ("kasi-holidays-15012690", "특일", holidays),
        ("upcoming", "일괄 예보", upcoming),
        ("promoted-model", "사용 모델", model),
    )
    result = []
    for dataset, title, read in readers:
        try:
            result.append(read())
        except (OSError, ValueError, KeyError, TypeError, pl.exceptions.PolarsError) as error:
            LOGGER.warning("%s 최신성 자료 오류 (%s)", dataset, type(error).__name__)
            result.append(row(dataset, title + " · 경고: 자료 오류"))
    return result
