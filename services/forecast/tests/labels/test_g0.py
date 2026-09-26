"""G0 모집단·연도별 조건·순간 최대 환산 경계가 후속 모델 선택을 왜곡하지 않는지 검증한다."""

from datetime import date

import pytest
from crowdcast.labels.g0 import build_g0, g0_judgment
from crowdcast.labels.merge import merge_labels
from crowdcast.labels.schema import label_row
from label_fixtures import festival


# 일평균이 1,000명을 넘어도 먹거리 행사 환산 순간 최대는 아래 층에 있어야 한다.
def test_primary_usable_venue_gold_and_peak_units() -> None:
    events = [festival(event_id=f"연천-{i}", type="먹거리") for i in range(6)]
    rows = []
    for event in events:
        row = label_row(event, "goldA", "연천.csv", "2")
        row.update(daily_mean=1200.0, total=4800.0, days=4, method="일평균")
        rows.append(row)
    for i, scope, usable in [(1, "행사장", False), (2, "지정영역", True), (3, "행사장", True)]:
        row = {**rows[i], "label_tier": "goldB", "spatial_scope": scope, "usable_for_training": usable}
        rows.append(row)
    rows[4]["usable_for_training"] = False
    labels = merge_labels(rows, {events[5]["event_id"]})
    g0 = build_g0(labels, events)
    assert g0["gold_summary"] == {
        "gold_event_count": 2,
        "peak_below_1000_count": 2,
        "peak_ge_1000_count": 0,
        "peak_missing_count": 0,
    }
    assert all(row["peak_estimate"] < 1000 for row in g0["gold_events"])
    assert g0["gold_by_year"][0]["year"] == 2024 and g0["gold_by_year"][0]["gold_event_count"] == 0
    assert "< 30" in g0_judgment(g0)


# 골드 60건만으로 통과하지 않고 평가 연도와 환산 층 양쪽의 표본을 동시에 요구한다.
@pytest.mark.parametrize(
    "count,year_count,small_count,decision",
    [
        (29, 15, 10, "simple"),
        (30, 15, 10, "partial"),
        (60, 15, 10, "planned"),
        (60, 14, 10, "partial"),
        (60, 15, 9, "partial"),
    ],
)
def test_g0_three_conditions(count: int, year_count: int, small_count: int, decision: str) -> None:
    events, rows = [], []
    for index in range(count):
        year = 2024 if index < year_count else 2025
        event = festival(event_id=f"연천-{index}", year=year, start=date(year, 5, 2), end=date(year, 5, 5))
        events.append(event)
        row = label_row(event, "goldA", "연천.csv", str(index + 2))
        daily = 100.0 if index < small_count else 10000.0
        row.update(daily_mean=daily, total=daily * 4, days=4, method="일평균")
        rows.append(row)
    g0 = build_g0(merge_labels(rows, set()), events)
    assert g0["decision"] == decision
    assert g0["gold_summary"]["peak_below_1000_count"] == small_count
    assert g0["gold_summary"]["peak_ge_1000_count"] == count - small_count
    assert ("계획대로" in g0_judgment(g0)) == (decision == "planned")


# 종료일만 있는 학습 가능 골드는 전체 표본에 남되 환산 일정을 추측하지 않는다.
def test_unknown_peak_calendar_is_counted_separately() -> None:
    event = festival(start=None)
    row = label_row(event, "goldA", "연천.csv", "2")
    row.update(daily_mean=10000.0, total=40000.0, days=4, method="일평균")
    summary = build_g0(merge_labels([row], set()), [event])["gold_summary"]
    assert summary["gold_event_count"] == 1 and summary["peak_missing_count"] == 1
