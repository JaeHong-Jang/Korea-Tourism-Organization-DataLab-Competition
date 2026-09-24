"""공개된 일정과 공휴일 발행본으로 행사 기간·달력 피처를 계산한다."""

from datetime import date, timedelta
from typing import Any

from crowdcast.features.availability import Feature, publication_date, published


# 공휴일 발행본이 없으면 휴일 수를 영으로 지어내지 않는다.
def calendar_features(event: dict[str, Any], as_of: date) -> dict[str, Feature]:
    start, end = event["start"], event["end"]
    days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    available = publication_date(event.get("date_available_at") or event.get("available_at"))
    result = {
        "duration": published(float(len(days)), available),
        "weekend_days": published(float(sum(day.weekday() >= 5 for day in days)), available),
        "month": published(float(start.month), available),
        "holiday_days": Feature(None, None),
        "holiday_streak": Feature(None, None),
    }
    calendar = event.get("holiday_calendar")
    if calendar is None:
        return result

    # 달력 발행본 전체의 공개일을 남겨 임시 공휴일의 사후 추가도 누수 검사에 걸리게 한다.
    calendar_at = publication_date(calendar.get("available_at"))
    if calendar_at is None or available is None:
        return result
    holiday_dates = {publication_date(day) for day in calendar["dates"]}
    longest = streak = 0
    for day in days:
        streak = streak + 1 if day in holiday_dates or day.weekday() >= 5 else 0
        longest = max(longest, streak)
    latest = max(available, calendar_at)
    result["holiday_days"] = published(float(sum(day in holiday_dates for day in days)), latest)
    result["holiday_streak"] = published(float(longest), latest)
    return result
