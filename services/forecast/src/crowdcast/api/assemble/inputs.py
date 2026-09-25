"""행사 입력을 기존 피처 형식으로 옮기고 KST 기준 공개 시점과 지역 단절을 제한한다."""

from datetime import date, datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import polars as pl
from crowdcast import paths

KOREA = ZoneInfo("Asia/Seoul")
BREAK_CODES = {"28110", "28140", "28260"}
BREAK_DATE = date(2026, 6, 30)


# 테스트가 시계를 고정할 수 있도록 오늘의 한국 날짜를 한 곳에서 읽는다.
def today() -> date:
    return datetime.now(KOREA).date()


# 날짜는 UTC 날짜가 아니라 행사 개최지의 한국 날짜를 기준으로 한다.
def korean_date(value: str) -> date:
    return datetime.fromisoformat(value.upper()).astimezone(KOREA).date()


# 임박한 요청과 오래 전 조기 요청 모두 공개 정보의 상한을 유지한다.
def cutoff(event: dict[str, Any]) -> date:
    return min(today(), korean_date(event["startsAt"]) - timedelta(days=14))


# 요청의 행사 속성만 옮기며 저장된 사후 속성을 덧붙이지 않는다.
def feature_event(event: dict[str, Any]) -> dict[str, Any]:
    return {
        "event_id": event["id"],
        "name": event["name"],
        "type": event["type"],
        "start": korean_date(event["startsAt"]),
        "end": korean_date(event["endsAt"]),
        "time_of_day": event["timeOfDay"],
        "sigungu_code": event["sigunguCode"],
        "fee": event["fee"],
        "host_type": event["hostType"],
        "budget_krw": event["budgetKrw"],
        "edition": event["edition"],
        "hazard_flags": event["hazards"],
        "continuity_break": event["sigunguCode"] in BREAK_CODES,
        **{
            name: event[name]
            for name in (
                "visitors_announced",
                "visitors_announced_meaning",
                "visitors_announced_available_at",
            )
            if name in event
        },
    }


# 파일 교체 시 캐시 키가 달라져 다음 요청부터 새 전처리 자료를 사용한다.
def table(name: str) -> pl.DataFrame:
    path = paths.PROCESSED / f"{name}.parquet"
    stat = path.stat()
    return _table(path, stat.st_mtime_ns, stat.st_size)


# 원본 표는 읽기만 하고 필터·집계 결과만 요청 단위로 만든다.
@lru_cache(maxsize=12)
def _table(path: Path, modified: int, size: int) -> pl.DataFrame:
    return pl.read_parquet(path)


# 관측일과 공개일을 따로 제한해 공개 전 값과 개편 후 지역 값을 제거한다.
def region_rows(code: str, as_of: date) -> pl.DataFrame:
    frame = table("region_daily").filter(
        (pl.col("sigungu_code") == code) & (pl.col("date") < as_of) & (pl.col("available_at") <= as_of)
    )
    if code in BREAK_CODES:
        frame = frame.filter(pl.col("date") <= BREAK_DATE)
    return frame


# 한 출처라도 골든으로 지정된 행사는 전 출처에서 제외한다.
def primary_labels(as_of: date) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    events = table("events").to_dicts()
    labels = table("labels").to_dicts()
    golden = {row["event_id"] for row in events + labels if row.get("is_golden")}
    index = {row["event_id"]: row for row in events}
    known = []
    for row in labels:
        event = index.get(row["event_id"])
        if (
            row["event_id"] in golden
            or not row["is_primary"]
            or row["available_at"] is None
            or row["available_at"] > as_of
            or event is None
            or not event.get("end")
            or event["end"] >= as_of
            or (event.get("sigungu_code") in BREAK_CODES and event["end"] > BREAK_DATE)
            or (row["label_tier"] == "goldB" and row["spatial_scope"] != "행사장")
        ):
            continue
        known.append(row)
    return events, known
