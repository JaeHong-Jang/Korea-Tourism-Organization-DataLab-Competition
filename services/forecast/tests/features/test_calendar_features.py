"""사후 지정 임시공휴일을 연휴에서 제외하고 법정·대체공휴일을 보존하는지 검사한다."""

from datetime import date

import pytest
from crowdcast.features.calendar_features import calendar_features, statutory_holidays


# 임시공휴일인 2023년 10월 2일은 주말과 개천절 사이의 연휴를 잇지 않는다.
@pytest.mark.parametrize("supplied", [False, True])
def test_temporary_holiday_does_not_extend_streak(supplied: bool) -> None:
    event = {"start": date(2023, 10, 1), "end": date(2023, 10, 3)}
    if supplied:
        event["holiday_calendar"] = {
            "dates": ["2023-10-02", "2023-10-03"],
            "available_at": "2023-10-04",
        }
    result = calendar_features(event, date(2023, 9, 17))
    assert result["holiday_days"].value == 1
    assert result["holiday_streak"].value == 1
    assert date(2023, 10, 2) not in statutory_holidays(2023, 2023)


# 어린이날·부처님오신날과 대체공휴일은 늦게 온 요청 달력이 빼더라도 규칙 달력대로 쓴다.
@pytest.mark.parametrize("supplied", [False, True])
def test_statutory_and_substitute_holidays(supplied: bool) -> None:
    event = {"start": date(2025, 5, 3), "end": date(2025, 5, 6)}
    if supplied:
        event["holiday_calendar"] = {"dates": ["2025-05-05"], "available_at": "2025-05-20"}
    result = calendar_features(event, date(2025, 4, 19))
    assert result["holiday_days"].value == 2
    assert result["holiday_streak"].value == 4
