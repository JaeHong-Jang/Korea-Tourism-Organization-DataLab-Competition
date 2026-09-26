"""실제 골드A 열·BOM·시도 근거·검산 및 미매칭 보존을 검증한다."""

from datetime import date, timedelta
from pathlib import Path

import pytest
from crowdcast.labels.gold_a import build_gold_a, parse_row
from crowdcast.labels.matching import EventMatcher
from label_fixtures import festival, gold_files


# 원본 BOM과 오타 열을 그대로 읽고 기간 합계를 일 단위로 변환한다.
def test_actual_headers_bom_and_unmatched(tmp_path: Path) -> None:
    path = gold_files(tmp_path)
    assert path.read_bytes().startswith(b"\xef\xbb\xbf")
    unmatched = []
    rows = build_gold_a(tmp_path, EventMatcher([festival()]), unmatched)
    assert len(rows) == 1
    row = rows[0]
    assert (row["daily_mean"], row["total"], row["days"]) == (46631.25, 186525, 4)
    assert (row["local"], row["nonlocal"], row["foreign"]) == (17581, 28942, 108.25)
    assert row["source_row"] == "7"
    assert row["available_at"] == date(2025, 5, 5) + timedelta(days=180)
    assert "목적지 주소" in row["method"]
    assert {r["year"] for r in unmatched} == {2018, 2019, 2022, 2023, 2024}
    assert all(r["festival_name"] == "연천구석기축제" for r in unmatched)


# 마스터에 후보가 하나여도 시도 근거가 없거나 다른 시도면 매칭하지 않는다.
def test_sido_and_ambiguous_occurrences(tmp_path: Path) -> None:
    path = gold_files(tmp_path)
    for companion in path.parent.glob("*_목적지 검색순위.csv"):
        companion.unlink()
    unmatched = []
    assert not build_gold_a(tmp_path, EventMatcher([festival()]), unmatched)
    assert all(r["reason"] == "시도 확인 불가" for r in unmatched)
    matcher = EventMatcher([festival(), festival(event_id="e-2025-41800-연천가을")])
    assert matcher.match("2025 연천 구석기축제", 2025, "경기", "연천.csv", 2, unmatched) is None
    assert unmatched[-1]["reason"] == "복수 회차"
    assert (
        EventMatcher([festival()]).match("연천구석기축제", 2025, "강원도", "연천.csv", 2, unmatched) is None
    )
    assert unmatched[-1]["reason"] == "이름·연도·시도 불일치"


# 1%는 허용하고 이를 넘는 검산 차이는 원본 값을 보존한 채 학습에서 제외한다.
@pytest.mark.parametrize(("daily", "flagged"), [(101, False), (101.0001, True)])
def test_reconciliation_boundary(daily: float, flagged: bool) -> None:
    raw = {
        "축체기간(일)": "4",
        "일평균 방문자수": str(daily),
        "(전체)방문자수": "400",
        "(현지인)방문자수": "100",
        "(외지인)방문자수": "300",
        "(외국인)방문자수": "0",
    }
    row = parse_row(raw, festival(), "연천.csv", 2, "시도 열")
    assert (row["quality_flag"] != "ok") == flagged
    assert row["usable_for_training"] == (not flagged)
    assert row["daily_mean"] == daily


# 종료일과 코로나 표시는 원본을 지우거나 임의 날짜로 채우지 않는다.
def test_missing_end_and_covid(tmp_path: Path) -> None:
    gold_files(tmp_path)
    row = build_gold_a(tmp_path, EventMatcher([festival(end=None)]), [])[0]
    assert row["available_at"] is None and not row["usable_for_training"]
    assert row["quality_flag"] == "end_date_missing"
