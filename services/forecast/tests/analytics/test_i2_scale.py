"""고정 규모 등급의 정확한 경계와 빈 구간 보존을 검증한다."""

from crowdcast.analytics.insights.i2_scale import daily_scale


# 경계값은 다음 등급에 포함하고 같은 값에는 같은 등급을 배정한다.
def test_fixed_boundaries():
    values = [0, 9999, 10000, 10000, 19999, 20000, 24995]
    rows = [{"dailyMean": {"p50": value}} for value in values]
    result = daily_scale(rows)
    assert [row["dailyScaleGrade"] for row in rows] == [1, 1, 2, 2, 2, 3, 3]
    assert [band["count"] for band in result["bands"]] == [2, 3, 2]
    assert result["method"] == "fixed"


# 표본이 없는 등급도 남겨 기간과 검색 조건에 따라 경계가 움직이지 않게 한다.
def test_empty_missing_and_same_values():
    assert daily_scale(None) is None
    assert [band["count"] for band in daily_scale([])["bands"]] == [0, 0, 0]
    rows = [{"dailyMean": {"p50": 14500}} for _ in range(5)]
    result = daily_scale(rows)
    assert [band["count"] for band in result["bands"]] == [0, 5, 0]
    assert [band["upperExclusive"] for band in result["bands"]] == [10000, 20000, None]
