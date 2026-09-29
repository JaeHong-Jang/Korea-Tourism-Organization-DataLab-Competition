"""발표 후보를 연도별로 세고 현재·미래 대상 연도와 다른 지역을 제외한다."""

from crowdcast.analytics.insights.i1_coverage import announcement_coverage


# 출처 행 중복을 후보쌍 중복으로 세지 않고 같은 행사의 연도는 별도 후보로 센다.
def test_past_coverage() -> None:
    events = {"a": {"event_id": "a", "name": "연천구석기축제", "year": 2026, "sigungu_code": "41800"}}
    key = ("연천구석기축제", "41800")
    rows = [{"visitors_announced": 100}, {"visitors_announced": 100}]
    result = announcement_coverage(
        [{"eventId": "a"}],
        events,
        {
            (key, 2025): rows,
            (key, 2024): rows,
            (key, 2026): rows,
            (key, 2027): rows,
            (("연천구석기축제", "11110"), 2023): rows,
            (key, 2022): [{"visitors_announced": 0}],
        },
    )
    assert result["coveredCount"] == 1
    assert result["candidatePairs"] == 2
    assert result["years"] == [{"year": 2025, "count": 1}, {"year": 2024, "count": 1}]
