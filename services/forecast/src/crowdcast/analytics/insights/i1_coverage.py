"""예보 대상의 과거 발표 자료 후보를 세되 유효한 발표·관측 비교쌍과 구분한다."""

from collections import Counter
from typing import Any

from crowdcast.analytics.insights.records import number
from crowdcast.features.history_features import festival_key


# 같은 이름·지역의 과거 대상 연도별 후보를 중복 없이 세며 관측 존재를 추정하지 않는다.
def announcement_coverage(
    forecasts: list[dict[str, Any]],
    events: dict[str, dict[str, Any]],
    announcements: dict[tuple[Any, Any], list[dict[str, Any]]],
) -> dict[str, Any]:
    by_year: Counter[int] = Counter()
    covered = set()
    for forecast in forecasts:
        event = events.get(forecast["eventId"])
        if not event or not event.get("year"):
            continue
        key = festival_key(event)
        if not key[1]:
            continue
        for (candidate_key, year), rows in announcements.items():
            if candidate_key != key or not isinstance(year, int) or year >= event["year"]:
                continue
            if any(
                (value := number(row.get("visitors_announced"))) is not None and value > 0 for row in rows
            ):
                by_year[year] += 1
                covered.add(event["event_id"])
    return {
        "targetCount": len(forecasts),
        "coveredCount": len(covered),
        "candidatePairs": sum(by_year.values()),
        "years": [{"year": year, "count": count} for year, count in sorted(by_year.items(), reverse=True)],
        "meaning": "같은 이름·지역의 과거 발표 자료 후보; 장소·집계 조건 및 관측 연결 미확인",
    }
