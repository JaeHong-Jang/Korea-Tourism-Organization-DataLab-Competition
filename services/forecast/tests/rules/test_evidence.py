"""근거의 해시 재현성·계약 필수 필드·법정 조항 연결을 검사한다."""

from typing import Any

import pytest
from crowdcast.api.contract import validate
from crowdcast.rules.evidence import assumption_evidence, rule_evidence, rule_settings
from crowdcast.rules.peak import sample_peak


# 법정 규칙은 조항을, 자체 규칙은 null을 가지며 모든 필수 필드를 채운다.
def test_rule_evidence_contract_and_master_ids(master_ids: dict[str, Any]) -> None:
    for rule_id, rule in rule_settings()["rules"].items():
        evidence = rule_evidence(rule_id, {"probability": 0.5, "threshold": 1000})
        validate("evidence", evidence)
        assert evidence["id"].startswith("ev-")
        assert evidence["ruleId"] in master_ids["rules"]
        assert evidence["checkResult"] is None
        assert evidence["assumptionId"] is None
        assert rule["kind"] in evidence["summary"]
        assert '"probability":0.5' in evidence["summary"]
        if rule["kind"] == "법정":
            assert evidence["clauseId"] == "law-disaster-act-enf-73-9"
            assert evidence["clauseId"] in master_ids["clauses"]
        else:
            assert evidence["clauseId"] is None


# 사전 키 순서에는 무관하지만 실제 입력·수치 연결·사유가 달라지면 근거 ID가 달라진다.
def test_rule_evidence_hash_tracks_inputs() -> None:
    first = rule_evidence("rule-internal-10pct", {"probability": 0.1, "threshold": 1000})
    same = rule_evidence("rule-internal-10pct", {"threshold": 1000, "probability": 0.1})
    changed = rule_evidence("rule-internal-10pct", {"threshold": 1000, "probability": 0.2})
    linked = rule_evidence(
        "rule-internal-10pct", {"threshold": 1000, "probability": 0.1}, quantity_ids=["q-yeongjong-peak"]
    )
    assert first == same
    assert len({first["id"], changed["id"], linked["id"]}) == 3


# 가정은 적용 범위와 출처를 남기고 변경된 범위는 별도 근거가 된다.
def test_assumption_evidence_records_applied_range(event: dict[str, Any]) -> None:
    assumption = sample_peak([100, 200, 300], event, seed=1).assumptions[0]
    first = assumption_evidence(assumption)
    changed = assumption_evidence({**assumption, "high": assumption["high"] + 0.1})
    validate("evidence", first)
    assert first["id"] != changed["id"]
    assert "docs/plan/06 §4" in first["summary"] and "추정 산식 기반" in first["summary"]
    assert str(assumption["low"]) in first["summary"]
    assert str(assumption["high"]) in first["summary"]


# 등록되지 않은 규칙이나 가정과 비유한 입력은 근거로 발행할 수 없다.
def test_invalid_evidence_inputs(event: dict[str, Any]) -> None:
    with pytest.raises(ValueError, match="기준 그래프"):
        rule_evidence("rule-internal-unregistered", {})
    with pytest.raises(ValueError):
        rule_evidence("rule-internal-10pct", {"probability": float("nan")})
    assumption = sample_peak([100, 200, 300], event, seed=1).assumptions[0]
    with pytest.raises(ValueError, match="기준 그래프"):
        assumption_evidence({**assumption, "id": "as-unregistered"})
    with pytest.raises(ValueError, match="범위"):
        assumption_evidence({**assumption, "low": assumption["value"] + 1})
