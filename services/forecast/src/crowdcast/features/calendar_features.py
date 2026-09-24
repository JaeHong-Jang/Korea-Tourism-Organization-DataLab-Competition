"""행사 일정과 법정·대체공휴일만으로 기간·달력 피처를 계산한다."""

from datetime import date, timedelta
from functools import lru_cache
from typing import Any

import holidays
from crowdcast.features.availability import Feature


# 지정 시각을 복원할 수 없는 임시공휴일은 규칙 달력에서 제외한다.
@lru_cache(maxsize=32)
def statutory_holidays(first_year: int, last_year: int) -> frozenset[date]:
    calendar = holidays.KR(years=range(first_year, last_year + 1), language="ko")
    return frozenset(day for day, name in calendar.items() if "임시" not in name)


# 요청에 달력이 딸려 와도 쓰지 않고 공개 시점 문제가 없는 규칙 달력만 쓴다.
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
    holiday_dates = statutory_holidays(start.year, end.year)

    # 달력 자체는 사전 규칙이며 행사 일정에서 파생된 값은 행사 입력으로 구분한다.
    longest = streak = 0
    for day in days:
        streak = streak + 1 if day in holiday_dates or day.weekday() >= 5 else 0
        longest = max(longest, streak)
    result["holiday_days"] = Feature(float(sum(day in holiday_dates for day in days)), None, False)
    result["holiday_streak"] = Feature(float(longest), None, False)
    return result
