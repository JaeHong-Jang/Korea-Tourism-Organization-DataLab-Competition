"""반복 예측 집계가 식별자·결측·실제 0을 올바르게 구분하는지 검증한다."""

from copy import deepcopy

from crowdcast.analytics.insights.i2_diagnostics import prediction_patterns


# 같은 인원값에 서로 다른 식별자가 있어도 하나의 예측 패턴으로 집계한다.
def test_patterns_count_values_and_preserve_zero() -> None:
    rows = [
        {
            "eventId": key,
            "dailyMean": {"p10": 0, "p50": 1, "p90": 2, "id": key},
            "peakConcurrent": {"p10": 0, "p50": peak, "p90": 3},
            "judgment": {"ruleIds": ["rule-internal-5000"]},
            "ood": key == "연천",
        }
        for key, peak in (("연천", 1), ("서울", 2))
    ]
    events = {row["eventId"]: {"type": "전통"} for row in rows}
    result = prediction_patterns(rows, events)
    assert result is not None
    assert result["dailyPatternCount"] == 1
    assert result["peakPatternCount"] == 2
    assert result["largeRuleCount"] == 2
    assert result["outsideTrainingCount"] == 1
    assert result["types"] == [{"type": "전통", "count": 2, "patterns": 1}]
    # 일부 값이 잘못됐을 때 완전한 표본의 진단처럼 공개하지 않는다.
    for value in (None, True, float("nan"), float("inf"), -1, 4):
        invalid = deepcopy(rows)
        invalid[0]["dailyMean"]["p50"] = value
        assert prediction_patterns(invalid, events) is None


# 예보가 없으면 반복 비율이나 패턴 수를 추정하지 않는다.
def test_empty_patterns() -> None:
    assert prediction_patterns([], {}) is None
