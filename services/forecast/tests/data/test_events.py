"""행사 ID·중복 충돌·원문 단위·위험 조건·개편 단절의 회귀를 검증한다."""

import re
from datetime import date
from pathlib import Path

import polars as pl
import pytest
from crowdcast.api.contract import validate
from crowdcast.data.events import (
    EVENT_DTYPES,
    contract_event,
    event_id,
    make_event,
    merge_duplicates,
    october_counts,
    validate_events,
)
from event_fixtures import gazetteer_fixture, mcst_row


# 공백·연도·회차 표기와 입력 순서가 달라도 같은 행사 ID와 한 행을 만든다.
def test_identity_and_duplicate_merge(tmp_path: Path) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    first = make_event(mcst_row(), gazetteer)
    second = make_event(mcst_row(festival_name="2026 수원 화성 문화제", source_row=7), gazetteer)
    assert first["event_id"] == second["event_id"]
    assert re.fullmatch(r"^e-[a-z0-9][a-z0-9_.:-]{1,120}$", first["event_id"])
    merged, _ = merge_duplicates([first, second])
    assert merge_duplicates([second, first])[0] == merged
    assert len(merged) == 1 and len(merged[0]["source_refs"]) == 2
    assert merged[0]["visitors_announced"] == 10000
    assert merged[0]["visitors_announced_meaning"] == first["visitors_announced_meaning"]
    assert event_id("고성탈축제", 2026, None, "강원 고성군") != event_id(
        "고성탈축제", 2026, None, "경남 고성군"
    )
    assert event_id("와흘메밀문화제(봄)", 2026, "50110") != event_id("와흘메밀문화제(가을)", 2026, "50110")
    validate_events(pl.from_dicts(merged, schema=EVENT_DTYPES))


# 겹치는 기간은 합치지만 서로 다른 발표 정의는 한 수치로 섞지 않는다.
def test_conflicting_duplicates(tmp_path: Path) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    first = make_event(mcst_row(start_date=date(2026, 10, 9), end_date=date(2026, 10, 11)), gazetteer)
    second = {
        **first,
        "start": date(2026, 10, 11),
        "end": date(2026, 10, 13),
        "start_mcst": date(2026, 10, 11),
        "end_mcst": date(2026, 10, 13),
        "visitors_announced_meaning": "2025년 일평균(명)",
    }
    merged, conflicts = merge_duplicates([first, second])
    assert len(merged) == 1 and merged[0]["event_id"] == first["event_id"]
    assert merged[0]["start"] == date(2026, 10, 9) and merged[0]["end"] == date(2026, 10, 13)
    assert merged[0]["start_mcst"] == merged[0]["start"] and merged[0]["end_mcst"] == merged[0]["end"]
    assert merged[0]["visitors_announced"] is None
    assert merged[0]["visitors_announced_meaning"] is None
    assert conflicts


# 개편 전 과거 사례는 보존하고 2026년 7월 이후 또는 일정 미정이면 단절 표시한다.
@pytest.mark.parametrize(
    ("year", "end", "name", "expected"),
    [
        (2025, date(2025, 10, 1), "중구", False),
        (2026, date(2026, 6, 30), "동구", False),
        (2026, date(2026, 7, 1), "서구", True),
        (2026, None, "중구", True),
        (2026, None, "영종구", True),
        (2026, None, "미추홀구", False),
    ],
)
def test_incheon_break(tmp_path: Path, year: int, end: date, name: str, expected: bool) -> None:
    event = make_event(
        mcst_row(year=year, end_date=end, sido="인천광역시", sigungu_name=name), gazetteer_fixture(tmp_path)
    )
    assert event["continuity_break"] is expected


# 산지명 일부와 먹는 밤은 위험·야간으로 잘못 분류하지 않는다.
def test_hazards_unknowns_and_multi_region(tmp_path: Path) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    event = make_event(mcst_row(festival_name="영종불꽃축제", venue="수상무대"), gazetteer)
    assert event["hazard_flags"] == ["수면", "폭죽"]
    ordinary = make_event(mcst_row(festival_name="공주알밤축제", venue="부산"), gazetteer)
    assert ordinary["hazard_flags"] == [] and ordinary["time_of_day"] is None
    ambiguous = make_event(mcst_row(sigungu_name="종로구, 중구", sido="서울특별시"), gazetteer)
    assert ambiguous["sigungu_match"] == "ambiguous" and ambiguous["sigungu_code"] is None
    assert ambiguous["coord_source"] == "none"
    assert event["is_golden"] is False


# 발표 방문객을 사전 예상값에 넣지 않고 날짜 경계 투영의 계약 형식을 검사한다.
def test_event_contract_projection(tmp_path: Path) -> None:
    event = make_event(
        mcst_row(
            festival_name="수원화성문화재야행", start_date=date(2026, 10, 9), end_date=date(2026, 10, 11)
        ),
        gazetteer_fixture(tmp_path),
    )
    projected = contract_event(event)
    validate("event", projected)
    assert projected["expectedByHost"] is None
    assert projected["source"] == "문체부"
    assert october_counts([event]) == (1, 1)
    unknown = contract_event({**event, "time_of_day": None})
    validate("event", unknown)
    assert unknown["timeOfDay"] == "미상"
    for field in ("start", "end", "sigungu_code", "lat", "lng"):
        with pytest.raises(ValueError, match=field):
            contract_event({**event, field: None})
