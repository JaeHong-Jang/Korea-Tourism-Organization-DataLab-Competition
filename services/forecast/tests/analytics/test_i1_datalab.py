"""공식 CSV의 연도와 원수치 보존, 날짜 비추정, I1 격리를 검증한다."""

import copy
import json

import pytest
from crowdcast.analytics.insights.i1_datalab import attach_datalab, load_datalab
from crowdcast.analytics.insights.i1_inventory import collection_inventory
from crowdcast.analytics.insights.records import Inputs


# 실제 군산 2023 다운로드 형식으로 발표와 통신 추정의 다른 수치를 구성한다.
def observation():
    return {
        "eventId": "gunsan-2023",
        "festival": "군산시간여행축제",
        "year": 2023,
        "region": "군산시",
        "days": 4,
        "total": 255296,
        "daily": 63824,
        "sourceFile": "군산시간여행축제_연도별 방문자 추이.csv",
        "sha256": "a" * 64,
        "announced": {"value": 130467, "year": 2023, "sources": ["문체부:2024.xlsx:세부현황:군산"]},
    }


# CSV의 일수만으로 시작일을 만들거나 기존 모델 입력을 변경하지 않는다.
def test_official_total_keeps_period_unknown_and_input_unchanged():
    events = {"gunsan-2023": {"event_id": "gunsan-2023", "year": 2023, "start": None, "end": None}}
    original = copy.deepcopy(events)
    updated, public, reports = attach_datalab(events, [observation()])
    inventory = collection_inventory(Inputs("2026-09-28T00:00:00+09:00"), updated, public, set(), reports)
    row = inventory["rows"][0]
    assert events == original
    assert row["start"] is None and row["end"] is None
    assert row["periodLabel"] == "2023년 · 4일"
    assert row["observed"]["value"] == 255296
    assert row["announced"]["value"] == 130467
    assert row["comparisonBasis"]["observationPeriod"] is None
    assert row["comparisonBasis"]["ratio"] is None
    assert row["directComparable"] is False


# 다음 해 문서라는 이유로 발표 대상 연도를 잘못 붙인 행은 거부한다.
def test_wrong_announcement_year_and_duplicate_are_rejected(tmp_path):
    path = tmp_path / "observations.json"
    row = observation()
    for records in ([row, row], [{**row, "announced": {**row["announced"], "year": 2024}}]):
        path.write_text(json.dumps({"version": 1, "rows": records}), encoding="utf-8")
        with pytest.raises(ValueError):
            load_datalab(path, (2023,))


# 동일 수치를 독립 관측 검증 성공으로 설명하지 않는다.
def test_equal_values_are_identified_without_comparison_promotion():
    row = observation()
    row["announced"]["value"] = row["total"]
    events, public, reports = attach_datalab({}, [row])
    result = collection_inventory(Inputs("2026-09-28T00:00:00+09:00"), events, public, set(), reports)[
        "rows"
    ][0]
    assert result["comparisonBasis"]["note"] == "동일 수치 · 독립 집계 미확인"
    assert not result["directComparable"]
