"""예보 입력의 일정과 제공된 공휴일 달력으로 행사 기간·달력 피처를 계산한다."""

from datetime import date, timedelta
from typing import Any

from crowdcast.features.availability import Feature, publication_date


# 공휴일 발행본이 없으면 휴일 수를 영으로 지어내지 않는다.
def calendar_features(event: dict[str, Any], as_of: date) -> dict[str, Feature]:
    start, end = event["start"], event["end"]
    days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    result = {
        "duration": Feature(float(len(days)), None, is_observation=False),
        "weekend_days": Feature(float(sum(day.weekday() >= 5 for day in days)), None, is_observation=False),
        "month": Feature(float(start.month), None, is_observation=False),
        "holiday_days": Feature(None, None, is_observation=False),
        "holiday_streak": Feature(None, None, is_observation=False),
    }
    calendar = event.get("holiday_calendar")
    if calendar is None:
        return result

    # 요청에 주어진 달력 정보도 행사 정의로 취급하고 외부 방문 관측과 구분한다.
    holiday_dates = {publication_date(day) for day in calendar["dates"]}
    longest = streak = 0
    for day in days:
        streak = streak + 1 if day in holiday_dates or day.weekday() >= 5 else 0
        longest = max(longest, streak)
    result["holiday_days"] = Feature(float(sum(day in holiday_dates for day in days)), None, False)
    result["holiday_streak"] = Feature(float(longest), None, False)
    return result
