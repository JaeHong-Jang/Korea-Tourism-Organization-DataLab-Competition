"""실버의 행사 전 기준선·공휴일·표본 잡음·3σ 및 제외 사유를 검증한다."""

import json
import math
from datetime import date, timedelta

import polars as pl
import pytest
from crowdcast.labels.silver import build_silver
from label_fixtures import festival, visitors


# 어린이날은 제외하고 세 월요일의 중앙값 100과 표본 표준편차 10을 사용한다.
@pytest.mark.parametrize(("observed", "usable"), [(130, False), (130.01, True), (90, False)])
def test_holiday_and_strict_three_sigma(observed: float, usable: bool) -> None:
    start = date(2025, 5, 12)
    values = {
        date(2025, 4, 14): 90,
        date(2025, 4, 21): 100,
        date(2025, 4, 28): 110,
        date(2025, 5, 5): 99999,
        start: observed,
    }
    rows, excluded = build_silver([festival(start=start, end=start)], visitors(values), "방문자.parquet")
    assert not excluded and len(rows) == 1
    row = rows[0]
    assert row["daily_mean"] == pytest.approx(observed - 100)
    assert row["snr"] == pytest.approx((observed - 100) / 10)
    assert row["usable_for_training"] == usable
    assert row["available_at"] == start + timedelta(days=35)
    assert not set(range(10, 13)) & set(json.loads(row["source_row"]))


# 14일 행사 두 번째 주의 기준선에도 첫 주 행사일이 들어가지 않는다.
def test_fixed_pre_event_window_and_residual_sample_std() -> None:
    start = date(2025, 7, 14)
    values = {}
    for offset in range(-28, 14):
        day = start + timedelta(days=offset)
        weekday_mean = 1000 + 100 * day.weekday()
        values[day] = weekday_mean + ([-3, -1, 1, 3][(offset + 28) // 7] if offset < 0 else 100)
    values[start - timedelta(days=35)] = 99999
    values[start + timedelta(days=20)] = 99999
    row = build_silver(
        [festival(start=start, end=start + timedelta(days=13))], visitors(values), "방문자.parquet"
    )[0][0]
    assert row["daily_mean"] == 100
    assert row["total"] == 1400
    assert row["snr"] == pytest.approx(100 / math.sqrt(140 / 27))
    assert row["usable_for_training"]
    assert "표본=28" in row["method"]
    assert len(json.loads(row["source_row"])) == 42 * 3


# 시 합계 행을 그대로 사용하고 함께 있는 자식 구 값을 다시 더하지 않는다.
def test_parent_city_and_zero_noise() -> None:
    start = date(2025, 7, 14)
    values = {start - timedelta(days=7 * week): 100 for week in range(1, 5)}
    values[start] = 101
    parent = visitors(values, "41110")
    children = visitors({day: 100000 for day in values}, "41111")
    event = festival(start=start, end=start, sigungu_code="41110", sigungu_match="parent")
    row = build_silver([event], pl.concat([parent, children]), "방문자.parquet")[0][0]
    assert row["daily_mean"] == 1 and row["snr"] is None
    assert not row["usable_for_training"] and row["quality_flag"] == "zero_sigma"
    assert "부모 합계 직접 사용=True" in row["method"]


# 기간 중 단 하루라도 세 구분이 불완전하면 짧은 기간으로 몰래 평균을 만들지 않는다.
def test_missing_observations_baseline_and_breaks() -> None:
    start = date(2025, 7, 14)
    values = {start - timedelta(days=7 * week): 100 for week in range(1, 5)}
    values[start] = 200
    event = festival(start=start, end=start)
    frame = visitors(values)
    incomplete = frame.filter(~((pl.col("date") == start) & (pl.col("tou_div") == "외국인")))
    rows, reasons = build_silver([event], incomplete, "방문자.parquet")
    assert not rows and reasons == {"행사 기간 일별 세 구분 누락·수치 오류": 1}
    sparse = frame.filter(pl.col("date") >= start - timedelta(days=14))
    assert build_silver([event], sparse, "방문자.parquet")[1] == {"같은 요일 기준선 3일 미만": 1}
    broken = frame.with_columns((pl.col("date") == start - timedelta(days=7)).alias("continuity_break"))
    assert build_silver([event], broken, "방문자.parquet")[1] == {"continuity_break": 1}
    events = [
        festival(start=None),
        festival(end=date(2025, 6, 1)),
        festival(sigungu_code=None),
        festival(continuity_break=True),
    ]
    assert build_silver(events, frame, "방문자.parquet")[1] == {
        "일정 미확정": 1,
        "기간 범위 밖(1~14일)": 1,
        "시군구 코드 없음": 1,
        "continuity_break": 1,
    }


# 중복 범주로 하루 합계가 부풀거나 없는 요일이 다른 요일로 대체되는 것을 막는다.
def test_duplicate_category_and_each_weekday_minimum() -> None:
    start = date(2025, 7, 14)
    values = {start - timedelta(days=7 * week): 100 for week in range(1, 5)}
    values.update({start: 200, start + timedelta(days=1): 200})
    frame = visitors(values)
    event = festival(start=start, end=start + timedelta(days=1))
    assert build_silver([event], frame, "방문자.parquet")[1] == {"같은 요일 기준선 3일 미만": 1}
    with pytest.raises(ValueError, match="키 중복"):
        build_silver([event], pl.concat([frame, frame.head(1)]), "방문자.parquet")


# null·비유한 값은 하루의 세 구분이 완전한 것으로 취급하지 않는다.
@pytest.mark.parametrize("invalid", [None, float("nan"), float("inf")])
def test_invalid_visitors_excluded(invalid: float | None) -> None:
    start = date(2025, 7, 14)
    frame = visitors({start: 200}).with_columns(
        pl.when(pl.col("tou_div") == "외국인")
        .then(pl.lit(invalid, dtype=pl.Float64))
        .otherwise(pl.col("visitors"))
        .alias("visitors")
    )
    rows, reasons = build_silver([festival(start=start, end=start)], frame, "방문자.parquet")
    assert not rows and reasons == {"행사 기간 일별 세 구분 누락·수치 오류": 1}


# 설·추석과 해당 대체휴일만 제외하고 인접 임시공휴일·일반 공휴일은 확장하지 않는다.
@pytest.mark.parametrize(
    "start,overlap",
    [
        (date(2024, 2, 9), True),
        (date(2024, 2, 12), True),
        (date(2025, 10, 5), True),
        (date(2025, 10, 8), True),
        (date(2025, 1, 27), False),
        (date(2025, 10, 9), False),
    ],
)
@pytest.mark.parametrize("increment", [-100, 100])
def test_holiday_overlap_before_training_filter(start: date, overlap: bool, increment: float) -> None:
    values = {start - timedelta(days=7 * week): 1000 + 10 * week for week in range(1, 5)}
    values[start] = 1025 + increment
    diagnostics = []
    rows, reasons = build_silver(
        [festival(start=start, end=start)], visitors(values), "방문자.parquet", diagnostics=diagnostics
    )
    assert not reasons
    assert ("holiday_overlap" in rows[0]["quality_flag"]) == overlap
    assert bool(diagnostics[0]["holiday_dates"]) == overlap
    assert rows[0]["usable_for_training"] == (increment > 0 and not overlap)
    assert diagnostics[0]["daily_mean"] == increment
    assert diagnostics[0]["baseline_mean"] == 1025


# 명절을 하루만 포함해도 전체 행사 실버를 제외하고 원래 음수 사례는 진단에 남긴다.
def test_multi_day_holiday_overlap() -> None:
    start = date(2025, 10, 4)
    values = {start + timedelta(days=offset): 1000 + (offset % 4) * 10 for offset in range(-28, 0)}
    values.update({start: 2000, start + timedelta(days=1): 2000})
    diagnostics = []
    rows, reasons = build_silver(
        [festival(start=start, end=start + timedelta(days=1))],
        visitors(values),
        "방문자.parquet",
        diagnostics=diagnostics,
    )
    assert not reasons and not rows[0]["usable_for_training"]
    assert diagnostics[0]["holiday_dates"] == ["2025-10-05"]
