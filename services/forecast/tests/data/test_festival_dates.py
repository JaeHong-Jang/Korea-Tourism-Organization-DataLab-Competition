"""TourAPI의 날짜 범위·점 포함·이름 점수·보강 실패를 외부 호출 없이 검증한다."""

from collections.abc import Callable
from datetime import date
from pathlib import Path

import httpx
import pytest
from crowdcast.data.events import make_event, merge_duplicates
from crowdcast.data.festival_dates import enrich_events, festival_period, fetch_festivals
from event_fixtures import gazetteer_fixture, mcst_row, tour_item


# 시작일은 포함 범위로 거르고 11월 말 시작·12월 종료 행사는 누락하지 않는다.
@pytest.mark.parametrize(
    ("start", "end", "valid"),
    [
        ("20260928", "20261001", False),
        ("20260929", "20261001", True),
        ("20261130", "20261215", True),
        ("20261201", "20261202", False),
        ("20261009", "20261008", False),
        ("20261032", "20261102", False),
        ("20261009", "", False),
    ],
)
def test_festival_start_window(start: str, end: str, valid: bool) -> None:
    assert (festival_period(tour_item(eventstartdate=start, eventenddate=end)) is not None) == valid


# 부모 시의 행사 ID와 원문 단위를 유지하면서 자식 구 안의 TourAPI 좌표·일정을 채운다.
def test_enrichment_and_unmatched_addition(tmp_path: Path) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    original = make_event(mcst_row(), gazetteer)
    result, audit = enrich_events(
        [original], [tour_item(), tour_item(contentid="77777", title="수원재즈페스티벌")], gazetteer
    )
    matched = next(row for row in result if row["event_id"] == original["event_id"])
    assert matched["sigungu_code"] == "41110" and matched["sigungu_match"] == "parent"
    assert matched["source"] == ["TourAPI", "문체부"]
    assert matched["start"] == date(2026, 10, 9) and matched["coord_source"] == "tourapi"
    assert matched["date_text"] == "10월 예정" and original["start"] is None
    assert matched["visitors_announced"] == original["visitors_announced"]
    assert matched["date_available_at"] == tour_item()["available_at"]
    assert len(result) == 2 and audit[0]["score"] == 1.0
    assert result[1]["source"] == ["TourAPI"]


# 주소와 점이 다른 구에 있으면 날짜는 보강하지만 좌표는 경계 중심을 유지한다.
def test_mismatching_coordinate(tmp_path: Path) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    original = make_event(mcst_row(), gazetteer)
    result, audit = enrich_events([original], [tour_item(mapy="37.29")], gazetteer)
    assert result[0]["coord_source"] == "centroid"
    assert result[0]["start"] == date(2026, 10, 9)
    assert audit[0]["coordinate"] == "주소·좌표 불일치"


# 시도도 미확정인 동일 이름과 다른 해의 행사는 같은 행사로 억지로 연결하지 않는다.
def test_unknown_region_and_year_do_not_match(tmp_path: Path) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    originals = [
        make_event(mcst_row(sido=None, sigungu_name=None, venue=None), gazetteer),
        make_event(mcst_row(year=2025), gazetteer),
    ]
    result, audit = enrich_events(originals, [tour_item()], gazetteer)
    assert len(result) == 3 and audit[0]["action"] == "추가"
    assert all(row["start"] is None for row in result[:2])
    assert "검토 필요: 시도 미확정" in audit[0]["rule"]
    assert originals[0]["event_id"] in audit[0]["rule"]


# 동일 행사에 상충하는 TourAPI 일정이 들어오면 어느 한쪽도 채택하지 않는다.
def test_multiple_schedules_are_held(tmp_path: Path) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    original = make_event(mcst_row(), gazetteer)
    result, audit = enrich_events(
        [original], [tour_item(), tour_item(contentid="506225", eventstartdate="20261010")], gazetteer
    )
    assert result[0]["start"] is None
    assert all("보류" in row["action"] for row in audit)


# 중복 TourAPI 콘텐츠는 출처 목록을 합쳐 한 행으로 남긴다.
def test_duplicate_tour_sources(tmp_path: Path) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    rows, _ = enrich_events([], [tour_item(), tour_item(contentid="506225")], gazetteer)
    result, _ = merge_duplicates(rows)
    assert len(result) == 1 and len(result[0]["source_refs"]) == 2


# 같은 요청은 캐시를 재사용하고 종료 필터 없이 시작일 하한만 서버에 전송한다.
def test_cached_search_budget(datago_factory: Callable) -> None:
    # 합성 응답은 공식 필드 형태만 재현하며 실제로 수집했다고 주장하지 않는다.
    def respond(request: httpx.Request) -> httpx.Response:
        assert request.url.params["eventStartDate"] == "20260929"
        assert "eventEndDate" not in request.url.params
        return httpx.Response(
            200,
            json={
                "response": {
                    "header": {"resultCode": "00"},
                    "body": {
                        "pageNo": 1,
                        "numOfRows": 1000,
                        "totalCount": 1,
                        "items": {"item": [tour_item()]},
                    },
                }
            },
        )

    client = datago_factory(max_calls=30, respond=respond)
    assert fetch_festivals(client) == fetch_festivals(client)
    assert client.ledger.calls == 1
    with pytest.raises(ValueError, match="30건"):
        fetch_festivals(datago_factory(max_calls=31, respond=respond))
