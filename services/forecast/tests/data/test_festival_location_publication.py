"""TourAPI 시도·좌표 불일치와 중복 응답의 최초 공개 시점 선택을 검증한다."""

from pathlib import Path

import pytest
from crowdcast.data.events import make_event, merge_duplicates
from crowdcast.data.festival_dates import enrich_events
from crowdcast.data.geocode import festival_location
from event_fixtures import gazetteer_fixture, mcst_row, tour_item


# 주소에 시도만 있어도 다른 시도에 놓인 좌표를 시군구 근거로 쓰지 않는다.
@pytest.mark.parametrize(("address", "allowed"), [("경기도", True), ("서울특별시", False), ("강원도", False)])
def test_province_only_address_checks_point(tmp_path: Path, address: str, allowed: bool) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    item = tour_item(addr1=address)
    code, lat, lng, status = festival_location(item, gazetteer)
    if allowed:
        assert (code, lat, lng) == ("41115", 37.27, 127.01)
        original = make_event(mcst_row(sigungu_name="본청", venue=None), gazetteer)
        result, _ = enrich_events([original], [item], gazetteer)
        assert result[0]["sigungu_code"] == code and result[0]["sigungu_match"] == "tourapi"
    else:
        assert code is lat is lng is None and "시도·좌표 불일치" in status
        original = make_event(mcst_row(sido=address, sigungu_name="본청", venue=None), gazetteer)
        result, audit = enrich_events([original], [item], gazetteer)
        assert result[0] == original and all(row["coord_source"] != "tourapi" for row in result)
        assert "보류" in audit[0]["coordinate"]


# 문체부 시도가 좌표 시도와 다르면 이름이 같아도 원문 코드·좌표를 보강하지 않는다.
def test_mcst_province_prevents_foreign_point(tmp_path: Path) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    original = make_event(mcst_row(sido="서울특별시", sigungu_name="본청", venue=None), gazetteer)
    result, _ = enrich_events([original], [tour_item(addr1="문화광장")], gazetteer)
    assert result[0] == original and result[0]["sigungu_code"] is None


# 동일 contentid·기간은 응답 순서와 시간대가 달라도 실제 가장 이른 공개 시점을 택한다.
@pytest.mark.parametrize("has_mcst", [False, True])
@pytest.mark.parametrize(("earlier", "later"), [
    ("2026-09-24T10:00:00+00:00", "2026-09-25T00:00:00+00:00"),
    ("2026-09-25T08:00:00+09:00", "2026-09-25T00:00:00+00:00"),
    ("2026-09-24T10:00:00+00:00", None),
])
def test_first_publication_is_order_independent(
    tmp_path: Path, has_mcst: bool, earlier: str, later: str | None,
) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    originals = [make_event(mcst_row(), gazetteer)] if has_mcst else []
    items = [tour_item(available_at=later), tour_item(available_at=earlier, source_hash="b" * 64)]
    result, audit = enrich_events(originals, items, gazetteer)
    assert enrich_events(originals, list(reversed(items)), gazetteer) == (result, audit)
    merged, conflicts = merge_duplicates(result)
    assert len(merged) == 1 and merged[0]["date_available_at"] == earlier
    assert len(merged[0]["source_refs"]) == (3 if has_mcst else 2)
    assert not conflicts
