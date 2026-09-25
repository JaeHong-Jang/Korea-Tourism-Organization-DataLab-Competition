"""합성 TourAPI 응답의 이미지·저작권이 행사 마스터에 한 쌍으로 보존되는지 검증한다."""

from collections.abc import Callable
from pathlib import Path

import httpx
import polars as pl
import pytest
from crowdcast.data.events import EVENT_DTYPES, make_event, merge_duplicates
from crowdcast.data.festival_dates import enrich_events, fetch_festivals
from event_fixtures import gazetteer_fixture, mcst_row, tour_item


# 응답 원본 우선·대체 이미지·저작권 필드 대소문자·결측을 parquet 저장까지 검사한다.
@pytest.mark.parametrize(("fields", "url", "copyright_code"), [
    ({"firstimage": "https://images.example/suwon.jpg", "firstimage2": "https://images.example/small.jpg",
      "cpyrhtDivCd": "Type1"}, "https://images.example/suwon.jpg", "Type1"),
    ({"firstimage": " ", "firstimage2": "https://images.example/suwon.png", "cpyrhtdivcd": "Type3"},
     "https://images.example/suwon.png", "Type3"),
    ({}, None, None),
    ({"cpyrhtDivCd": "Type2"}, None, "Type2"),
])
def test_response_to_master(
    tmp_path: Path, datago_factory: Callable, fields: dict, url: str | None, copyright_code: str | None,
) -> None:
    # 기존 클라이언트를 통해 응답 필드가 보강 단계까지 그대로 전달되는지 확인한다.
    def respond(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"response": {"header": {"resultCode": "00"}, "body": {
            "pageNo": 1, "numOfRows": 1000, "totalCount": 1, "items": {"item": [tour_item(**fields)]},
        }}})

    gazetteer = gazetteer_fixture(tmp_path)
    original = make_event(mcst_row(), gazetteer)
    assert original["image_url"] is None and original["image_copyright"] is None
    items = fetch_festivals(datago_factory(max_calls=30, respond=respond))
    for events in ([original], []):
        rows, _ = enrich_events(events, items, gazetteer)
        file = tmp_path / "events.parquet"
        pl.from_dicts(rows, schema=EVENT_DTYPES).write_parquet(file)
        saved = pl.read_parquet(file).row(0, named=True)
        assert saved["image_url"] == url and saved["image_copyright"] == copyright_code


# 날짜 충돌로 보류한 TourAPI 응답의 이미지를 기존 행사에 붙이지 않는다.
def test_held_enrichment_has_no_image(tmp_path: Path) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    original = make_event(mcst_row(), gazetteer)
    rows, _ = enrich_events([original], [tour_item(firstimage="https://images.example/suwon.jpg"),
                                        tour_item(eventstartdate="20261010")], gazetteer)
    assert rows[0]["image_url"] is None


# 중복 행에서 이미지가 없는 응답의 저작권을 다른 이미지에 섞지 않는다.
def test_duplicate_image_credit_pair(tmp_path: Path) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    rows, _ = enrich_events([], [tour_item(firstimage="https://images.example/suwon.jpg"),
                                tour_item(contentid="506225", cpyrhtDivCd="Type1")], gazetteer)
    merged, _ = merge_duplicates(rows)
    assert merged[0]["image_url"] == "https://images.example/suwon.jpg"
    assert merged[0]["image_copyright"] is None
