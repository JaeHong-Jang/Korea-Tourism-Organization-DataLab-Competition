"""문체부 날짜 보존·충돌 감사·시도 기반 후보 보강을 네트워크 없이 검증한다."""

from copy import deepcopy
from datetime import date
from pathlib import Path

import polars as pl
import pytest
from crowdcast.data.events import EVENT_DTYPES, make_event, merge_duplicates, quality_report, validate_events
from crowdcast.data.festival_dates import enrich_events
from event_fixtures import gazetteer_fixture, mcst_row, tour_item


# 기존 기간과 다른 TourAPI 일정은 원문·좌표·출처를 모두 보존하고 양쪽 근거를 남긴다.
@pytest.mark.parametrize(("start", "end"), [
    (date(2026, 10, 8), date(2026, 10, 11)),
    (date(2026, 10, 9), date(2026, 10, 12)),
    (date(2026, 10, 2), date(2026, 10, 4)),
    (None, date(2026, 10, 12)),
    (date(2026, 10, 8), None),
])
def test_mcst_date_conflict_is_held(tmp_path: Path, start: date | None, end: date | None) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    original = make_event(mcst_row(start_date=start, end_date=end, date_text="문체부 원문 일정"), gazetteer)
    untouched = deepcopy(original)
    result, audit = enrich_events([original], [tour_item()], gazetteer)
    assert result == [untouched] and original == untouched
    assert audit[0]["action"] == "보류: 일정 충돌"
    assert audit[0]["contentid"] == "506224"
    assert audit[0]["mcst_date_text"] == "문체부 원문 일정"
    assert audit[0]["mcst_source_refs"] == original["source_refs"]
    assert audit[0]["start_mcst"] == (start.isoformat() if start else None)
    assert audit[0]["end_mcst"] == (end.isoformat() if end else None)
    assert audit[0]["tourapi_start"] == "2026-10-09" and audit[0]["tourapi_end"] == "2026-10-11"
    report = quality_report([original], result, audit, [], "합성 응답 재생; 외부 호출 0건")
    assert "일정 충돌 보류: 1건" in report
    assert "문체부 원문 일정" in report and '"contentid": "506224"' in report


# 같은 기간의 TourAPI는 날짜 출처를 갈아 끼우지 않고 확인한 출처만 추가한다.
def test_equal_mcst_dates_only_add_date_provenance(tmp_path: Path) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    original = make_event(mcst_row(start_date=date(2026, 10, 9), end_date=date(2026, 10, 11)), gazetteer)
    result, audit = enrich_events([original], [tour_item()], gazetteer)
    matched = result[0]
    for field in ("event_id", "start", "end", "start_mcst", "end_mcst", "date_source",
                  "date_text", "date_available_at", "planned_month", "visitors_announced"):
        assert matched[field] == original[field]
    assert matched["source"] == ["TourAPI", "문체부"] and len(matched["source_refs"]) == 2
    assert tour_item()["available_at"] in matched["source_refs"][0]
    assert audit[0]["action"] == "출처 추가"


# 한쪽 날짜만 있거나 모두 미정이어도 기존 값을 보존하면서 빈 날짜만 채운다.
@pytest.mark.parametrize(("start", "end"), [
    (None, None), (date(2026, 10, 9), None), (None, date(2026, 10, 11)),
])
def test_only_missing_mcst_dates_are_filled(tmp_path: Path, start: date | None, end: date | None) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    original = make_event(mcst_row(start_date=start, end_date=end), gazetteer)
    result, audit = enrich_events([original], [tour_item()], gazetteer)
    matched = result[0]
    assert matched["start_mcst"] == start and matched["end_mcst"] == end
    assert matched["start"] == date(2026, 10, 9) and matched["end"] == date(2026, 10, 11)
    assert matched["date_source"] == "TourAPI" and matched["date_available_at"] == tour_item()["available_at"]
    assert audit[0]["action"] == "보강"


# 코드가 없던 본청 행사도 같은 시도·이름이면 부모 주소의 실제 점이 속한 구로 채운다.
def test_missing_code_uses_same_province_and_point(tmp_path: Path) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    original = make_event(mcst_row(sigungu_name="본청", sido="경기", venue=None), gazetteer)
    assert original["sigungu_code"] is None
    result, audit = enrich_events([original], [tour_item(addr1="경기도 수원시")], gazetteer)
    assert len(result) == 1 and result[0]["event_id"] == original["event_id"]
    assert result[0]["sigungu_code"] == "41115" and result[0]["sigungu_name"] == "수원시 팔달구"
    assert result[0]["sigungu_match"] == "tourapi" and result[0]["coord_source"] == "tourapi"
    assert (result[0]["lat"], result[0]["lng"]) == (37.27, 127.01)
    assert "동일 시도·코드 미정" in audit[0]["rule"]
    assert merge_duplicates(result)[0] == result
    validate_events(pl.from_dicts(result, schema=EVENT_DTYPES))


# 주소만 일치하고 좌표가 없거나 다른 구이면 미확정 코드를 임의로 채우지 않는다.
@pytest.mark.parametrize("point", [{"mapy": ""}, {"mapy": "37.29"}])
def test_missing_code_requires_verified_point(tmp_path: Path, point: dict) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    original = make_event(mcst_row(sigungu_name="본청", venue=None), gazetteer)
    result, _ = enrich_events([original], [tour_item(**point)], gazetteer)
    assert len(result) == 1 and result[0]["sigungu_code"] is None
    assert result[0]["coord_source"] == "none"


# 코드가 없는 이름 후보도 다른 시도·낮은 점수·동점이면 자동 보강하지 않는다.
@pytest.mark.parametrize("case", ["다른 시도", "낮은 점수", "차점 간격 부족", "동점"])
def test_province_candidates_keep_name_thresholds(tmp_path: Path, case: str) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    raw = mcst_row(sigungu_name="본청", venue=None)
    if case == "다른 시도":
        raw["sido"] = "서울특별시"
    if case == "낮은 점수":
        raw["festival_name"] = "수원재즈페스티벌"
    originals = [make_event(raw, gazetteer)]
    if case in {"차점 간격 부족", "동점"}:
        name = "수원화성문화제전" if case == "차점 간격 부족" else raw["festival_name"]
        originals.append(make_event(mcst_row(sigungu_name="시자체", venue=None,
                                             festival_name=name), gazetteer))
    result, audit = enrich_events(originals, [tour_item()], gazetteer)
    assert len(result) == len(originals) + 1 and audit[0]["action"] == "추가"
    assert result[:len(originals)] == originals


# 시도 미상 후보는 별도 검토 목록에 남겨 TourAPI 추가 행과 수동으로 대조할 수 있다.
def test_unknown_province_is_listed_for_review(tmp_path: Path) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    original = make_event(mcst_row(sido=None, sigungu_name="본청", venue=None), gazetteer)
    unrelated = make_event(mcst_row(festival_name="수원재즈페스티벌"), gazetteer)
    result, audit = enrich_events([original, unrelated], [tour_item()], gazetteer)
    assert result[0] == original and len(result) == 3
    report = quality_report([original], result, audit, [], "합성 응답 재생; 외부 호출 0건")
    review = report.split("## 검토 필요\n")[1].split("\n## TourAPI")[0]
    assert original["event_id"] in review and "시도 미확정" in review


# 인천 미확정 코드가 점으로 채워진 경우에도 2026년 개편 단절 표시를 다시 계산한다.
def test_incheon_break_after_point_enrichment(tmp_path: Path) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    original = make_event(mcst_row(festival_name="인천개항장문화유산야행", sido="인천광역시",
                                  sigungu_name="본청", venue=None), gazetteer)
    result, _ = enrich_events([original], [tour_item(title=original["name"], addr1="인천광역시 중구",
                                                   mapx="126.31", mapy="35.01")], gazetteer)
    assert original["continuity_break"] is False
    assert result[0]["sigungu_code"] == "28110" and result[0]["continuity_break"] is True


# TourAPI 전용 행에 문체부 원문 날짜가 생기지 않고 상충 응답도 입력 순서에 독립적이다.
def test_tourapi_audit_columns_and_conflict_order(tmp_path: Path) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    added, _ = enrich_events([], [tour_item()], gazetteer)
    assert added[0]["start_mcst"] is None and added[0]["end_mcst"] is None
    original = make_event(mcst_row(start_date=date(2026, 10, 9), end_date=date(2026, 10, 11)), gazetteer)
    items = [tour_item(), tour_item(contentid="506225", eventstartdate="20261010")]
    result, audit = enrich_events([original], items, gazetteer)
    assert enrich_events([original], list(reversed(items)), gazetteer) == (result, audit)
    assert result[0]["start"] == original["start"] and result[0]["end"] == original["end"]
    assert [row["action"] for row in audit] == ["출처 추가", "보류: 일정 충돌"]
