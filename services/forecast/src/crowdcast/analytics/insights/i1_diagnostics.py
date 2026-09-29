"""비교 기준을 바꾸지 않고 발표 메타 누락과 관측 자료 자격을 확인한다."""

from typing import Any

from crowdcast.analytics.insights.records import GOLD, number

FIELDS = {
    "visitors_announced_year": "발표 대상 연도",
    "visitors_announced_available_at": "발표일",
    "visitors_announced_start": "집계 시작일",
    "visitors_announced_end": "집계 종료일",
    "visitors_announced_spatial_scope": "집계 장소 범위",
    "visitors_announced_time_unit": "집계 단위",
}


# 기존 I1에서 허용하던 행사장 일평균 관측 조건을 한곳에서 검사한다.
def observation_ready(label: dict[str, Any]) -> bool:
    actual = number(label.get("daily_mean"))
    return (
        label.get("label_tier") in GOLD
        and bool(label.get("is_primary"))
        and label.get("definition") == "일평균"
        and label.get("time_unit") == "일"
        and label.get("spatial_scope") == "행사장"
        and label.get("kind") == "사후 집계"
        and actual is not None
        and actual > 0
    )


# 누락 건수는 발표값이 있는 행사 행을 분모로 하며 항목 간 중복을 허용한다.
def announcement_metadata(events: list[dict[str, Any]]) -> dict[str, Any]:
    announced = [row for row in events if number(row.get("visitors_announced")) is not None]
    return {
        "announcementRows": len(announced),
        "missingFields": [
            {"field": field, "label": label, "count": sum(row.get(field) is None for row in announced)}
            for field, label in FIELDS.items()
        ],
    }
