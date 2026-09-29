"""공개 사례가 미래 자료나 가짜 유효 비교쌍으로 발행되지 않는지 확인한다."""
import json
from datetime import date

import pytest
from crowdcast.analytics.insights.i1_public_sources import load_public_comparisons


# 근사 발표값과 통신 추정값의 검토 사례를 만든다.
def case():
    return {
        "id": "hongcheon-2026", "year": 2026, "eventName": "홍천강 꽁꽁축제",
        "periodLabel": "2026년 1월", "eventEndedAt": "2026-01-25", "checkedAt": "2026-09-28",
        "status": "conditions_unverified", "limitation": "집계 구역 미확인",
        "announced": {"label": "발표", "value": 270000, "unit": "명", "approximate": True},
        "observed": {"label": "통신 추정", "value": 379542, "unit": "명", "approximate": False},
        "sources": [
            {"title": "발표", "url": "https://www.hongcheon.go.kr/a", "publishedAt": "2026-01-26"},
            {"title": "관측", "url": "https://www.hongcheon.go.kr/b", "publishedAt": "2026-03-18"},
        ],
    }


# 파일이 없어도 기존 지표 계산은 계속 동작한다.
def test_missing_file_is_optional(tmp_path):
    assert load_public_comparisons(tmp_path / "absent.json", date(2026, 9, 28)) == []


# 근사·영값·단위 차이를 보존하고 입력에 끼워 넣은 비율을 발행하지 않는다.
def test_reference_values_never_become_valid_ratios(tmp_path):
    row = case()
    row["announced"].update(value=0, unit="매")
    row["ratio"] = 0.71
    path = tmp_path / "public.json"
    path.write_text(json.dumps({"version": 1, "rows": [row]}), encoding="utf-8")
    actual = load_public_comparisons(path, date(2026, 9, 28))[0]
    assert actual["ratio"] is None
    assert actual["announced"]["value"] == 0
    assert actual["announced"]["unit"] == "매"
    assert actual["announced"]["approximate"] is True


# 종료·확인·공개일이 미래이거나 수치·출처가 깨진 사례를 거부한다.
@pytest.mark.parametrize(
    "fault", ["end", "today", "checked", "published", "negative", "infinite", "source", "duplicate", "status"]
)
def test_invalid_public_case_is_rejected(tmp_path, fault):
    row = case()
    if fault == "end":
        row["eventEndedAt"] = "2026-12-01"
    elif fault == "today":
        row["eventEndedAt"] = "2026-09-28"
    elif fault == "checked":
        row["checkedAt"] = "2026-12-01"
    elif fault == "published":
        row["sources"][0]["publishedAt"] = "2026-12-01"
    elif fault == "negative":
        row["observed"]["value"] = -1
    elif fault == "infinite":
        row["observed"]["value"] = float("inf")
    elif fault == "source":
        row["sources"][0]["url"] = "javascript:alert(1)"
    elif fault == "status":
        row["status"] = "matched"
    rows = [row, row] if fault == "duplicate" else [row]
    path = tmp_path / "public.json"
    path.write_text(json.dumps({"version": 1, "rows": rows}), encoding="utf-8")
    with pytest.raises(ValueError):
        load_public_comparisons(path, date(2026, 9, 28))
