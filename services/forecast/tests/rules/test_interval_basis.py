"""구간 표시는 같은 표본의 판정·사유를 유지하고 확률 문구만 바꾸는지 검사한다."""

import json
from dataclasses import asdict
from statistics import median
from typing import Any

import pytest
from crowdcast.api.contract import validate
from crowdcast.rules.evidence import rule_settings
from crowdcast.rules.judge import judge


# 보간 중앙값과 확률 경계가 다른 이산 표본에서도 판정 함수를 바꾸지 않는다.
@pytest.mark.parametrize(
    "samples",
    [
        [0] * 4000,
        [0] * 2000 + [1000] * 2000,
        [0] * 3600 + [1000] * 400,
        [0] * 2000 + [5000] * 2000,
        [5000] * 4000,
    ],
)
@pytest.mark.parametrize("hazards", [[], ["불"], ["산", "수면"]])
def test_basis_changes_only_display(
    daytime_event: dict[str, Any], samples: list[int], hazards: list[str]
) -> None:
    event = {**daytime_event, "hazards": hazards}
    probability = judge(samples, event, basis="확률")
    interval = judge(samples, event, basis="구간")
    for key in ("level", "label", "ruleIds"):
        assert interval.judgment[key] == probability.judgment[key]
    for displayed, original in zip(
        interval.judgment["reasons"], probability.judgment["reasons"], strict=True
    ):
        for key in ("ruleId", "kind", "clauseId"):
            assert displayed[key] == original[key]
        rule = rule_settings()["rules"][displayed["ruleId"]]
        key = "below_text" if original["text"] == rule.get("below_text") else "text"
        assert displayed["text"] == rule.get(f"interval_{key}", original["text"])
        assert "표본 한계로 구간 기준 표시" not in displayed["text"]
        assert not any(character.isdigit() for character in displayed["text"])
        evidence = next(item for item in interval.evidence if item["id"] == displayed["evidenceId"])
        assert evidence["summary"].split(" 입력: ")[0] == f"{displayed['kind']} 기준 — {displayed['text']}"
    assert [item["id"] for item in interval.judgment["checklist"]] == [
        item["id"] for item in probability.judgment["checklist"]
    ]
    assert interval.judgment["basis"] == "구간"
    assert json.loads(json.dumps(interval.judgment))["basis"] == "구간"
    assert "%" not in json.dumps(asdict(interval), ensure_ascii=False)
    for display, original in zip(interval.probabilities, probability.probabilities, strict=True):
        assert display["probability"] == original["probability"]
        assert "표본 한계로 구간 기준 표시" in display["display"] and "%" not in display["display"]
        assert "순간 최대" in display["display"]
    if hazards:
        assert interval.judgment["level"] >= 3
    validate("judgment", interval.judgment)


# 법정 인원 규칙과 자체 가능성 해석을 구분하고 확률 모드의 기존 문구는 유지한다.
def test_legal_and_internal_reasons_differ(daytime_event: dict[str, Any]) -> None:
    expected = (
        "자체 기준 — 예측으로는 순간 최대가 법정 인원 기준에 닿을 가능성이 높아 수립 대상으로 봅니다. "
        "참고용 — 담당자 검토 필수"
    )
    result = judge([2002.5], daytime_event, basis="구간")
    texts = {reason["ruleId"]: reason["text"] for reason in result.judgment["reasons"]}
    assert texts["rule-internal-50pct"] == expected
    assert texts["rule-legal-1000"] != expected
    assert all("순간 최대 2,003~2,003명" in item["display"] for item in result.probabilities)
    original = judge([2002.5], daytime_event, basis="확률")
    assert all(reason["text"] == rule_settings()["rules"][reason["ruleId"]]["text"]
               for reason in original.judgment["reasons"])


# 절반만 기준에 닿은 표본은 중앙값이 기준 미만이어도 자체 대상 판정과 모순되지 않게 설명한다.
def test_internal_reason_at_half_probability_boundary(daytime_event: dict[str, Any]) -> None:
    samples = [0] * 2000 + [1000] * 2000
    assert median(samples) == 500
    interval = judge(samples, daytime_event, basis="구간")
    probability = judge(samples, daytime_event, basis="확률")
    assert interval.judgment["level"] == probability.judgment["level"] == 3
    assert interval.probabilities[0]["probability"] == probability.probabilities[0]["probability"] == 0.5

    # 사유와 근거 모두 중앙값·확률 수치를 단정하지 않는 수정 문구를 사용한다.
    reason = next(row for row in interval.judgment["reasons"] if row["ruleId"] == "rule-internal-50pct")
    assert "법정 인원 기준에 닿을 가능성이 높아" in reason["text"]
    assert "중앙값" not in reason["text"] and "%" not in reason["text"]
    assert not any(character.isdigit() for character in reason["text"])
    evidence = next(row for row in interval.evidence if row["id"] == reason["evidenceId"])
    assert evidence["summary"].split(" 입력: ")[0] == f"자체 기준 — {reason['text']}"


# 모르는 표시 방식은 기본값으로 조용히 바꾸지 않는다.
def test_invalid_basis(daytime_event: dict[str, Any]) -> None:
    with pytest.raises(ValueError, match="표시 방식"):
        judge([0.0], daytime_event, basis="모름")
