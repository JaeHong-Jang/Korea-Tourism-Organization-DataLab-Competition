"""하루·순간 단위와 영값을 보존하고 잘못된 구간을 차단한다."""

from copy import deepcopy

from crowdcast.analytics.insights.i2_people import forecast_people


# 영 방문객은 결측과 다르게 유효한 숫자로 전달한다.
def test_people_keeps_zero_and_units():
    rows = [
        {
            "id": "f1",
            "eventId": "e1",
            "dailyMean": {"p10": 0, "p50": 0, "p90": 10, "unit": "명/일"},
            "peakConcurrent": {"p10": 0, "p50": 0, "p90": 5, "unit": "명"},
        }
    ]
    events = {"e1": {"name": "연천구석기축제"}}
    result = forecast_people(rows, events)
    assert result[0]["dailyMean"]["p50"] == 0
    for field, value in (("unit", "명"), ("p50", 20), ("p90", float("nan"))):
        invalid = deepcopy(rows)
        invalid[0]["dailyMean"][field] = value
        assert forecast_people(invalid, events) is None
