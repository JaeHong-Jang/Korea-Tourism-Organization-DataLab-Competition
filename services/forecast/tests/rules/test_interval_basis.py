"""구간 표시는 같은 표본의 판정·사유를 유지하고 확률 문구만 바꾸는지 검사한다."""

import json
from dataclasses import asdict
from typing import Any

import pytest
from crowdcast.api.contract import validate
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
        assert "표본 한계로 구간 기준 표시" in displayed["text"]
        assert "순간 최대" in displayed["text"]
        evidence = next(item for item in interval.evidence if item["id"] == displayed["evidenceId"])
        assert displayed["text"] in evidence["summary"]
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


# 모르는 표시 방식은 기본값으로 조용히 바꾸지 않는다.
def test_invalid_basis(daytime_event: dict[str, Any]) -> None:
    with pytest.raises(ValueError, match="표시 방식"):
        judge([0.0], daytime_event, basis="모름")
