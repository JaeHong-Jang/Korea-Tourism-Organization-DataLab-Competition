"""개최계획서의 전년 발표 방문객수를 라벨과 구분한 행사 입력으로 보존한다."""

import math
from typing import Any

from crowdcast.features.availability import Feature, publication_date


# 평가 정의에 따라 가림을 마친 행사 입력을 쓰되 명시된 미래 공개일은 제외한다.
def announced_scale_daily(row: dict[str, Any]) -> float | None:
    available = publication_date(row.get("visitors_announced_available_at"))
    as_of = publication_date(row.get("as_of"))
    if available is not None and (as_of is None or available > as_of):
        return None
    value, duration = row.get("visitors_announced"), row.get("duration")
    if value is None or duration is None:
        return None
    if not math.isfinite(value) or value < 0 or not math.isfinite(duration) or duration <= 0:
        raise ValueError("발표 방문객수·행사 기간 오류")
    return float(value / duration) if value > 0 else None


# 조건부 입력은 공개일을 추정하지 않으며 파일명 날짜 검사는 별도 민감도 경로에 맡긴다.
def announced_features(event: dict[str, Any]) -> dict[str, Feature]:
    value = event.get("visitors_announced")
    if value is not None and (not math.isfinite(value) or value < 0):
        raise ValueError("행사 수치 오류: visitors_announced")
    available = publication_date(event.get("visitors_announced_available_at"))
    return {
        "visitors_announced": Feature(value, available, is_observation=False),
        "log_visitors_announced": Feature(
            math.log1p(value) if value is not None else None, available, is_observation=False
        ),
    }


# 직접 입력한 발표치를 우선하고 결측만 같은 행사 ID·지역·개최연도의 마스터에서 연결한다.
def with_announced(event: dict[str, Any], events: list[dict[str, Any]]) -> dict[str, Any]:
    if event.get("visitors_announced") is not None:
        return event
    matches = [row for row in events if row["event_id"] == event["event_id"]]
    if len(matches) != 1:
        return event
    master = matches[0]
    if (
        master.get("sigungu_code") != event.get("sigungu_code")
        or master.get("start") is None
        or master["start"].year != event["start"].year
    ):
        return event
    return {
        **event,
        **{
            name: master.get(name)
            for name in (
                "visitors_announced",
                "visitors_announced_meaning",
                "visitors_announced_available_at",
            )
        },
    }
