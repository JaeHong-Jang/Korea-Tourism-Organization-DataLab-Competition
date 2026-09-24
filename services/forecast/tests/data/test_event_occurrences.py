"""봄·가을 회차 분리와 단일 회차의 기존 ID·날짜 보존을 검증한다."""

from datetime import date
from itertools import permutations
from pathlib import Path

import polars as pl
import pytest
from crowdcast.data.events import EVENT_DTYPES, event_id, make_event, merge_duplicates, validate_events
from event_fixtures import gazetteer_fixture, mcst_row


# 실제 원본의 봄·가을 행사만 새 ID로 나누고 단일 회차의 기존 해시는 바꾸지 않는다.
def test_spring_autumn_split_and_existing_identity(tmp_path: Path) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    rows = [
        make_event(mcst_row(festival_name="2025 전주문화유산야행", year=2025, sido="전라북도",
                            sigungu_name="전주시", venue="전주한옥마을", planned_month=month,
                            start_date=date(2025, month, day), end_date=date(2025, month, day + 1),
                            source_row=month), gazetteer)
        for month, day in ((5, 23), (10, 17))
    ]
    old_id = "e-2025-52110-175dbd639a"
    assert rows[0]["event_id"] == rows[1]["event_id"] == old_id
    assert event_id("더북데이", 2025, "11440") == "e-2025-11440-1742170c8f"
    assert merge_duplicates([rows[0]])[0][0]["event_id"] == old_id
    assert merge_duplicates([rows[0], {**rows[0], "source_refs": ["문체부:재확인"]}])[0][0][
        "event_id"
    ] == old_id
    audit = []
    merged, _ = merge_duplicates(rows, audit)
    assert len(merged) == 2 and len({row["event_id"] for row in merged}) == 2
    assert old_id not in {row["event_id"] for row in merged}
    assert {row["planned_month"] for row in merged} == {5, 10}
    assert {(row["start"], row["end"]) for row in merged} == {
        (date(2025, 5, 23), date(2025, 5, 24)), (date(2025, 10, 17), date(2025, 10, 18))
    }
    assert all(row["start_mcst"] == row["start"] and row["end_mcst"] == row["end"] for row in merged)
    assert all(len(row["source_refs"]) == 1 for row in merged)
    assert audit == [{"event_id": old_id, "input_rows": 2, "occurrences": 2}]
    assert merge_duplicates(list(reversed(rows)))[0] == merge_duplicates(merged)[0] == merged
    validate_events(pl.from_dicts(merged, schema=EVENT_DTYPES))


# 입력 순서와 무관하게 맞닿거나 연결된 기간의 합집합을 한 회차로 남긴다.
def test_overlapping_periods_are_one_occurrence(tmp_path: Path) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    rows = [make_event(mcst_row(start_date=date(2026, 10, start), end_date=date(2026, 10, end)), gazetteer)
            for start, end in ((9, 11), (13, 15), (11, 13))]
    for order in permutations(rows):
        merged, _ = merge_duplicates(list(order))
        assert len(merged) == 1 and merged[0]["event_id"] == rows[0]["event_id"]
        assert merged[0]["start"] == date(2026, 10, 9) and merged[0]["end"] == date(2026, 10, 15)


# 날짜 없는 행끼리는 원래대로 병합하고 하나뿐인 알려진 일정도 지우지 않는다.
def test_undated_duplicate_merge(tmp_path: Path) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    rows = [make_event(mcst_row(planned_month=month), gazetteer) for month in (5, 10)]
    merged, _ = merge_duplicates(rows)
    assert len(merged) == 1 and merged[0]["event_id"] == rows[0]["event_id"]
    assert merged[0]["start"] is merged[0]["end"] is merged[0]["planned_month"] is None
    known = make_event(mcst_row(start_date=date(2026, 10, 9), end_date=date(2026, 10, 11)), gazetteer)
    merged, _ = merge_duplicates([rows[1], known])
    assert merged[0]["start"] == known["start"] and merged[0]["end"] == known["end"]


# 같은 월의 떨어진 회차는 승인된 월 해시만으로 구별되지 않으므로 조용히 합치지 않는다.
def test_same_month_identity_collision_is_explicit(tmp_path: Path) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    rows = [make_event(mcst_row(start_date=date(2026, 10, day), end_date=date(2026, 10, day)), gazetteer)
            for day in (9, 16)]
    with pytest.raises(ValueError, match="같은 시작 월"):
        merge_duplicates(rows)
