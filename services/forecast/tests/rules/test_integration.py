"""순간 최대 환산부터 판정까지 같은 표본을 쓰고 예보 계약으로 조립되는지 검증한다."""

import json
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from crowdcast.api.contract import validate
from crowdcast.rules.judge import judge
from crowdcast.rules.peak import sample_peak


# 영종 불꽃축제는 예상 방문객이 영이어도 법정 대상이며 두 환산 가정을 유지한다.
def test_fireworks_at_zero_attendance(event: dict[str, Any]) -> None:
    peak = sample_peak([0, 0, 0], event, seed=2026)
    result = judge(peak.samples, event)
    assert result.judgment["label"] == "수립 대상"
    assert "rule-legal-hazard" in result.judgment["ruleIds"]
    assert [item["probability"] for item in result.probabilities] == [0, 0]
    assert peak.assumption_ids == ["as-peak-day-factor", "as-concurrency-fireworks"]


# 다양한 규모와 표본 수에서도 구간과 두 초과 확률은 같은 최종 표본에서 나온다.
@pytest.mark.parametrize("daily", [[0, 0, 0], [500, 1000, 3000], [7400, 13000, 22000]])
@pytest.mark.parametrize("n", [1, 3, 100, 4000])
def test_single_distribution_consistency(event: dict[str, Any], daily: list[float], n: int) -> None:
    peak = sample_peak(daily, event, n=n, seed=2026)
    result = judge(peak.samples, event)
    quantity = peak.quantity("q-yeongjong-peak")
    assert quantity["p10"] <= quantity["p50"] <= quantity["p90"]
    for item in result.probabilities:
        assert item["probability"] == float(np.mean(peak.samples >= item["threshold"]))
        if quantity["p50"] > item["threshold"]:
            assert item["probability"] >= 0.5
    assert result.probabilities[0]["probability"] >= result.probabilities[1]["probability"]


# 같은 seed로 수치·판정·근거 전체가 재현되며 확률 입력 변경은 근거 해시를 바꾼다.
def test_reproducible_judgment(event: dict[str, Any]) -> None:
    first = sample_peak([7400, 13000, 22000], event, seed=42)
    second = sample_peak([7400, 13000, 22000], event, seed=42)
    result = judge(first.samples, event)
    assert first.quantity("q-yeongjong-peak") == second.quantity("q-yeongjong-peak")
    assert first.evidence == second.evidence
    assert result == judge(second.samples, event)
    assert result.evidence[0]["id"] != judge([0], event).evidence[0]["id"]


# 실제 예보 픽스처의 담당 필드를 교체해 추가 계약 변경 없이 조립됨을 확인한다.
def test_forecast_contract_with_all_generated_fragments(
    event: dict[str, Any], contract_fixtures: Path, master_ids: dict[str, Any]
) -> None:
    forecast = json.loads((contract_fixtures / "forecast/valid-yeongjong.json").read_text(encoding="utf-8"))
    peak = sample_peak(forecast["dailyMean"], event, seed=2026)
    result = judge(peak.samples, event)
    retained_evidence = [item for item in forecast["evidence"] if item["kind"] not in {"rule", "assumption"}]
    forecast.update(
        peakConcurrent=peak.quantity(forecast["peakConcurrent"]["id"]),
        probabilities=result.probabilities,
        judgment=result.judgment,
        assumptions=peak.assumptions,
        evidence=retained_evidence + peak.evidence + result.evidence,
    )
    validate("forecast", forecast)
    fragments = {item["id"]: item for item in forecast["evidence"]}
    for reason in forecast["judgment"]["reasons"]:
        assert fragments[reason["evidenceId"]]["ruleId"] == reason["ruleId"]
    for item in forecast["judgment"]["checklist"]:
        assert all(fragments[evidence_id]["ruleId"] == item["ruleId"] for evidence_id in item["evidenceIds"])
    assert set(forecast["peakConcurrent"]["assumptionIds"]) <= set(master_ids["assumptions"])
    assert {item["assumptionId"] for item in peak.evidence} == set(peak.assumption_ids)
