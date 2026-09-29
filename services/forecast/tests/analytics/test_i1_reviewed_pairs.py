"""검토 자료의 기간 검증과 I1 전용 연결이 다른 예보 입력을 바꾸지 않는지 확인한다."""

import copy
import json
from datetime import date

import pytest
from crowdcast.analytics.insights.i1_reviewed_pairs import attach_reviewed, reviewed_pairs


# 부산불꽃축제의 실제 종료일과 단위가 다른 두 원수치를 구성한다.
def reviewed():
    return {
        "eventId": "busan-2024",
        "eventName": "부산불꽃축제",
        "year": 2024,
        "start": "2024-11-09",
        "end": "2024-11-09",
        "region": "부산광역시",
        "observedStart": "2024-11-09",
        "observedEnd": "2024-11-09",
        "checkedAt": "2026-09-28",
        "directComparable": False,
        "announced": {"value": 1030000, "unit": "명", "label": "발표"},
        "observed": {"value": 181485, "unit": "명/일", "label": "보고서 추정"},
        "scope": "축제 분석 구역",
        "limitation": "집계대상 미확인",
        "sources": [
            {"title": "개최계획", "file": "계획.xlsx:573"},
            {"title": "관측 보고서", "url": "https://www.dh.go.kr/report"},
        ],
    }


# 날짜 없는 마스터를 보완해도 원본과 직접 비교 판정에는 영향을 주지 않는다.
def test_reviewed_schedule_is_local_to_inventory():
    events = {"busan-2024": {"event_id": "busan-2024", "year": 2024, "start": None, "end": None}}
    original = copy.deepcopy(events)
    updated, public, reports = attach_reviewed(events, [reviewed()])
    assert events == original
    assert updated["busan-2024"]["start"] == date(2024, 11, 9)
    assert public[0]["directComparable"] is False
    assert public[0]["announced"]["unit"] == "명"
    assert reports[0]["unit"] == "명/일"


# 미래 행사, 중복 행사, 출처 누락을 보완 자료로 발행하지 않는다.
def test_invalid_reviewed_rows_are_rejected(tmp_path):
    path = tmp_path / "reviewed.json"
    row = reviewed()
    path.write_text(json.dumps({"version": 1, "rows": [row]}), encoding="utf-8")
    assert len(reviewed_pairs(path, date(2026, 9, 28))) == 1
    for rows in ([row, row], [{**row, "end": "2027-11-09"}], [{**row, "sources": []}]):
        path.write_text(json.dumps({"version": 1, "rows": rows}), encoding="utf-8")
        with pytest.raises(ValueError):
            reviewed_pairs(path, date(2026, 9, 28))
