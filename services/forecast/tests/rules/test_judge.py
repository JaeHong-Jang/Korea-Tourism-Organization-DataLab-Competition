"""법정 위험 우선순위와 확률 경계, 사유 템플릿 및 근거 계약을 검증한다."""

from typing import Any

import numpy as np
import pytest
from crowdcast.api.contract import validate
from crowdcast.rules.evidence import rule_settings
from crowdcast.rules.judge import judge


# 표본에서 정확히 10%·50%인 경우를 포함해 네 등급과 대규모 경계를 검사한다.
@pytest.mark.parametrize(
    ("legal_count", "large_count", "level", "label"),
    [
        (0, 0, 1, "소규모"),
        (9, 0, 1, "소규모"),
        (10, 0, 2, "수립 권고"),
        (49, 0, 2, "수립 권고"),
        (50, 0, 3, "수립 대상"),
        (100, 0, 3, "수립 대상"),
        (50, 49, 3, "수립 대상"),
        (50, 50, 4, "대규모"),
        (100, 100, 4, "대규모"),
    ],
)
def test_probability_boundaries(
    daytime_event: dict[str, Any],
    dry_weather: dict[str, Any],
    legal_count: int,
    large_count: int,
    level: int,
    label: str,
) -> None:
    samples = [0] * (100 - legal_count) + [1000] * (legal_count - large_count) + [5000] * large_count
    result = judge(samples, daytime_event, dry_weather)
    validate("judgment", result.judgment)
    assert result.judgment["level"] == level
    assert result.judgment["label"] == label
    assert [item["probability"] for item in result.probabilities] == [legal_count / 100, large_count / 100]
    assert [item["threshold"] for item in result.probabilities] == [1000, 5000]
    assert ("rule-legal-1000" in result.judgment["ruleIds"]) == (legal_count >= 50)
    assert ("rule-internal-50pct" in result.judgment["ruleIds"]) == (legal_count >= 50)
    assert ("rule-internal-5000" in result.judgment["ruleIds"]) == (level == 4)
    # 매뉴얼 계획 점검을 제외한 기존 체크리스트의 문구·순서·근거는 그대로여야 한다.
    previous_checks = [
        item
        for item in result.judgment["checklist"]
        if "level_min" not in rule_settings()["rules"][item["ruleId"]].get("conditions", {})
    ]
    if level == 4:
        assert previous_checks == [
            {
                "id": "ck-traffic",
                "text": "교통·주차 통제 계획과 경찰·소방 사전 협의",
                "ruleId": "rule-internal-5000",
                "evidenceIds": [result.judgment["reasons"][-1]["evidenceId"]],
            }
        ]
    else:
        assert previous_checks == []


# 문턱 바로 아래와 같은 값은 각각 미달·도달로 집계하고 확률은 반올림하지 않는다.
def test_inclusive_thresholds_and_exact_probability(daytime_event: dict[str, Any]) -> None:
    values = np.array([np.nextafter(1000, 0), 1000, np.nextafter(5000, 0), 5000])
    result = judge(values, daytime_event)
    assert [item["probability"] for item in result.probabilities] == [0.75, 0.25]
    assert [item["display"] for item in result.probabilities] == ["75.0%", "25.0%"]
    assert judge([0, 0, 1000], daytime_event).probabilities[0]["probability"] == 1 / 3


# 표시 경계와 판정 경계를 따로 검사해 반올림으로 확률이나 등급이 바뀌지 않게 한다.
@pytest.mark.parametrize(
    ("count", "n", "display", "level"),
    [
        (0, 4000, "표본 4,000개 모두 기준 미만", 1),
        (1, 4000, "0.1% 미만", 1),
        (3, 4000, "0.1% 미만", 1),
        (4, 4000, "0.1%", 1),
        (5, 4000, "0.1%", 1),
        (399, 4000, "10% 미만", 1),
        (400, 4000, "10.0%", 2),
        (401, 4000, "10.0%", 2),
        (1999, 4000, "50% 미만", 2),
        (2000, 4000, "50.0%", 4),
        (2001, 4000, "50.0%", 4),
        (3938, 4000, "98.5%", 4),
        (3995, 4000, "99.9%", 4),
        (3996, 4000, "99.9%", 4),
        (3997, 4000, "99.9% 초과", 4),
        (3999, 4000, "99.9% 초과", 4),
        (4000, 4000, "표본 4,000개 모두 기준 이상", 4),
        (0, 1, "표본 1개 모두 기준 미만", 1),
        (1, 1, "표본 1개 모두 기준 이상", 4),
        (7, 7, "표본 7개 모두 기준 이상", 4),
    ],
)
def test_probability_display_preserves_boundaries(
    daytime_event: dict[str, Any], count: int, n: int, display: str, level: int
) -> None:
    result = judge([0] * (n - count) + [5000] * count, daytime_event)
    assert result.judgment["level"] == level
    assert [item["probability"] for item in result.probabilities] == [count / n, count / n]
    assert [item["display"] for item in result.probabilities] == [display, display]


# 두 인원 기준의 경계 전후에서 표시 문구로 읽은 확률도 원래 확률과 같은 등급을 뜻한다.
@pytest.mark.parametrize("threshold", [1000, 5000])
@pytest.mark.parametrize("boundary_count", [400, 2000])
@pytest.mark.parametrize("offset", [-2, -1, 0, 1, 2])
def test_displayed_probabilities_imply_same_level(
    daytime_event: dict[str, Any],
    dry_weather: dict[str, Any],
    threshold: int,
    boundary_count: int,
    offset: int,
) -> None:
    count = boundary_count + offset
    below = 0 if threshold == 1000 else 1000
    result = judge([below] * (4000 - count) + [threshold] * count, daytime_event, dry_weather)
    tested = next(item for item in result.probabilities if item["threshold"] == threshold)
    assert tested["probability"] == count / 4000

    # 미만 표시는 해당 경계 바로 아래로 읽고 숫자·이상 표시는 적힌 비율로 읽는다.
    percentages: list[float] = []
    for item in result.probabilities:
        display = item["display"]
        if display == "표본 4,000개 모두 기준 미만":
            percentage = 0.0
        elif display == "표본 4,000개 모두 기준 이상":
            percentage = 100.0
        else:
            number, qualifier = display.split("%", maxsplit=1)
            assert qualifier in {"", " 미만", " 이상"}
            percentage = float(number)
            if qualifier == " 미만":
                percentage = float(np.nextafter(percentage, 0))
        assert (percentage >= 10) == (item["probability"] >= 0.1)
        assert (percentage >= 50) == (item["probability"] >= 0.5)
        percentages.append(percentage)

    # 법정 위험이 없는 행사에서 표시된 두 확률만으로 네 등급을 다시 판정한다.
    legal, large = percentages
    displayed_level = 4 if large >= 50 else 3 if legal >= 50 else 2 if legal >= 10 else 1
    expected_level = (
        (1 if count < 400 else 2 if count < 2000 else 3) if threshold == 1000 else (3 if count < 2000 else 4)
    )
    assert displayed_level == result.judgment["level"] == expected_level


# 여섯 법정 위험은 영인원에서도 대상이며 대규모이면 상위 등급과 법정 근거를 함께 유지한다.
@pytest.mark.parametrize("hazard", ["불", "폭죽", "가연성가스", "석유류", "산", "수면"])
@pytest.mark.parametrize(("samples", "level"), [([0], 3), ([0] * 51 + [1000] * 49, 3), ([5000], 4)])
def test_hazards_override_population(
    daytime_event: dict[str, Any], hazard: str, samples: list[float], level: int
) -> None:
    result = judge(samples, {**daytime_event, "hazards": [hazard]})
    assert result.judgment["level"] == level
    reason = next(item for item in result.judgment["reasons"] if item["ruleId"] == "rule-legal-hazard")
    assert reason["kind"] == "법정"
    assert reason["clauseId"] == "law-disaster-act-enf-73-9"
    assert "rule-internal-10pct" not in result.judgment["ruleIds"]
    assert hazard in result.evidence[0]["summary"]
    validate("judgment", result.judgment)


# 규모 외 위험은 체크리스트를 켜지만 법정 대상 판정으로 승격하지 않는다.
@pytest.mark.parametrize("hazard", ["차량진입", "단일출입구", "무대밀집", "야간조명부족"])
def test_nonlegal_risks_keep_small_level(daytime_event: dict[str, Any], hazard: str) -> None:
    result = judge([0], {**daytime_event, "hazards": [hazard]})
    assert result.judgment["level"] == 1
    assert result.judgment["checklist"]
    assert all(reason["kind"] == "자체" for reason in result.judgment["reasons"])


# 체크리스트는 네 등급 모두에서 유지하며 각 사유와 항목은 실제 반환 근거를 가리킨다.
@pytest.mark.parametrize("samples", [[0], [0] * 9 + [1000], [1000], [5000]])
def test_every_reason_and_check_has_contract_evidence(
    daytime_event: dict[str, Any], master_ids: dict[str, Any], samples: list[float]
) -> None:
    result = judge(samples, {**daytime_event, "hazards": ["차량진입"]})
    assert {"rule-check-vehicle", "rule-check-rain-shelter"} <= {
        item["ruleId"] for item in result.judgment["checklist"]
    }
    fragments = {item["id"]: item for item in result.evidence}
    assert len(fragments) == len(result.evidence)
    referenced = set()
    for reason in result.judgment["reasons"]:
        fragment = fragments[reason["evidenceId"]]
        referenced.add(fragment["id"])
        assert fragment["ruleId"] == reason["ruleId"]
        assert fragment["clauseId"] == reason["clauseId"]
        rule = rule_settings()["rules"][reason["ruleId"]]
        assert reason["text"] == rule["below_text" if result.judgment["level"] == 1 else "text"]
        assert "참고용 — 담당자 검토 필수" in reason["text"]
        if reason["kind"] == "법정":
            assert reason["clauseId"] in master_ids["clauses"]
    for item in result.judgment["checklist"]:
        for evidence_id in item["evidenceIds"]:
            assert fragments[evidence_id]["ruleId"] == item["ruleId"]
            referenced.add(evidence_id)
    assert referenced == fragments.keys()
    assert set(result.judgment["ruleIds"]) == {item["ruleId"] for item in result.judgment["reasons"]}
    for fragment in result.evidence:
        validate("evidence", fragment)
        assert fragment["ruleId"] in master_ids["rules"]
        assert fragment["checkResult"] is None


# 잘못된 표본을 확률 영으로 처리해 소규모를 반환하지 않는다.
@pytest.mark.parametrize("samples", [[], -1, [-1, 0], [float("nan")], [float("inf")], [[1, 2]]])
def test_invalid_samples(daytime_event: dict[str, Any], samples: Any) -> None:
    with pytest.raises(ValueError, match="순간 최대 표본"):
        judge(samples, daytime_event)
