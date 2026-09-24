"""불완전한 일정의 분리와 결측 발표값 병합이 원문을 잃지 않는지 확인한다."""

from datetime import date
from pathlib import Path

import polars as pl
import pytest
from crowdcast.data.events import EVENT_DTYPES, make_event, merge_duplicates, quality_report, validate_events
from event_fixtures import gazetteer_fixture, mcst_row


# 알려진 날짜가 기간 내부나 양 끝이면 합치고 밖이면 원문을 가진 별도 회차로 둔다.
@pytest.mark.parametrize("field", ["start_date", "end_date"])
@pytest.mark.parametrize("day", [1, 9, 10, 11, 20])
def test_partial_date_respects_complete_period(tmp_path: Path, field: str, day: int) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    complete = make_event(mcst_row(start_date=date(2026, 10, 9), end_date=date(2026, 10, 11)), gazetteer)
    partial = make_event(mcst_row(**{field: date(2026, 10, day)}, date_text="한쪽 날짜만 공고"), gazetteer)
    result, conflicts = merge_duplicates([complete, partial])
    assert merge_duplicates([partial, complete]) == (result, conflicts)
    assert merge_duplicates(result)[0] == result
    if 9 <= day <= 11:
        assert len(result) == 1 and result[0]["event_id"] == complete["event_id"]
        assert result[0]["start"] == complete["start"] and result[0]["end"] == complete["end"]
    else:
        assert len(result) == len({row["event_id"] for row in result}) == 2
        preserved = next(row for row in result if row["date_text"] == partial["date_text"])
        for key in ("start", "end", "start_mcst", "end_mcst"):
            assert preserved[key] == partial[key]
        report = quality_report(result, result, [], conflicts, "미실행")
        held = report.split("## 병합 보류\n")[1].split("\n## 중복 충돌")[0]
        assert "한쪽 날짜만 공고" in held and "2026-10-09" in held and "2026-10-11" in held
        assert f"2026-10-{day:02d}" in held
    validate_events(pl.from_dicts(result, schema=EVENT_DTYPES))


# 한쪽 값이나 정의가 없을 뿐인 중복은 실제 발표값과 의미 원문을 그대로 살린다.
@pytest.mark.parametrize("missing", [
    {"visitors_announced": None}, {"visitors_announced_meaning": None},
    {"visitors_announced": None, "visitors_announced_meaning": None},
])
def test_missing_announcement_is_not_conflict(tmp_path: Path, missing: dict) -> None:
    first = make_event(mcst_row(), gazetteer_fixture(tmp_path))
    second = {**first, **missing}
    result, conflicts = merge_duplicates([first, second])
    assert merge_duplicates([second, first]) == (result, conflicts)
    assert result[0]["visitors_announced"] == first["visitors_announced"]
    assert result[0]["visitors_announced_meaning"] == first["visitors_announced_meaning"]
    assert not conflicts


# 수치나 정의가 실제로 다르면 어느 쪽 수치를 쓸지 단정하지 않고 QC에 남긴다.
@pytest.mark.parametrize("changes", [
    {"visitors_announced": 20000}, {"visitors_announced_meaning": "2025년 일평균(명)"},
])
def test_conflicting_announcement_remains_unknown(tmp_path: Path, changes: dict) -> None:
    first = make_event(mcst_row(), gazetteer_fixture(tmp_path))
    result, conflicts = merge_duplicates([first, {**first, **changes}, {**first, "visitors_announced": None}])
    assert result[0]["visitors_announced"] is result[0]["visitors_announced_meaning"] is None
    assert any(next(iter(changes)) in message for message in conflicts)
