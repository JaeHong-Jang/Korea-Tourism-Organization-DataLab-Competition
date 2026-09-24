"""하나의 순간 최대 표본에서 초과 확률과 법정·자체 판정 및 근거를 만든다."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

import numpy as np
from numpy.typing import NDArray

from crowdcast.rules import checklist
from crowdcast.rules.evidence import rule_evidence, rule_settings


# 계약 판정과 예보의 확률·근거 필드를 묶어 API 조립 단계로 넘긴다.
@dataclass(frozen=True)
class JudgmentResult:
    judgment: dict[str, Any]
    probabilities: list[dict[str, Any]]
    evidence: list[dict[str, Any]]


# 빈 표본·다차원·음수·비유한 수로 잘못된 소규모 판정이 나오는 것을 막는다.
def _peak_samples(samples: Sequence[float] | NDArray[np.float64]) -> NDArray[np.float64]:
    values = np.asarray(samples, dtype=np.float64)
    if values.ndim != 1 or values.size == 0 or not np.isfinite(values).all() or (values < 0).any():
        raise ValueError("순간 최대 표본은 비어 있지 않은 유한한 음수 아닌 일차원 배열이어야 합니다.")
    return values


# 실제 확률은 보존하고 표시는 표본의 일부·전체 도달 및 판정 경계의 방향을 유지한다.
def _probability(samples: NDArray[np.float64], threshold: int, boundaries: Sequence[float]) -> dict[str, Any]:
    count = int(np.count_nonzero(samples >= threshold))
    probability = float(count / samples.size)
    if count == 0:
        display = f"표본 {samples.size:,}개 모두 기준 미만"
    elif count == samples.size:
        display = f"표본 {samples.size:,}개 모두 기준 이상"
    elif probability < 0.001:
        display = "0.1% 미만"
    elif probability > 0.999:
        display = "99.9% 초과"
    else:
        # 소수 첫째 자리 반올림이 판정 경계를 넘으면 실제 확률의 경계 방향을 적는다.
        percentage = f"{probability * 100:.1f}"
        rounded = float(percentage) / 100
        display = f"{percentage}%"
        for boundary in boundaries:
            if probability < boundary <= rounded:
                display = f"{boundary * 100:g}% 미만"
                break
            if rounded < boundary <= probability:
                display = f"{boundary * 100:g}% 이상"
                break
    return {"threshold": threshold, "probability": probability, "display": display}


# 법정 위험 요소는 규모와 무관하게 대상이며 대규모 자체 기준이 최종 등급을 높인다.
def judge(
    samples: Sequence[float] | NDArray[np.float64],
    event: Mapping[str, Any],
    weather: Mapping[str, Any] | None = None,
    *,
    basis: str = "확률",
) -> JudgmentResult:
    if basis not in {"확률", "구간"}:
        raise ValueError("판정 표시 방식은 확률 또는 구간이어야 합니다.")
    values = _peak_samples(samples)
    settings = rule_settings()
    thresholds = settings["thresholds"]
    boundaries = sorted(
        {
            thresholds["recommend_probability"],
            thresholds["target_probability"],
            thresholds["large_probability"],
        }
    )
    probabilities = [
        _probability(values, thresholds["legal_crowd"], boundaries),
        _probability(values, thresholds["large_crowd"], boundaries),
    ]
    p_legal, p_large = (item["probability"] for item in probabilities)
    hazards = sorted(set(event["hazards"]) & set(settings["legal_hazards"]))

    # 확률 해석은 자체 기준으로 따로 남기고 법정 위험 요소의 대상 판정을 우선한다.
    level = 1
    applied: list[tuple[str, str]] = []
    if hazards:
        level = 3
        applied.append(("rule-legal-hazard", "text"))
    if p_legal >= thresholds["target_probability"]:
        level = 3
        applied.extend([("rule-legal-1000", "text"), ("rule-internal-50pct", "text")])
    elif not hazards:
        level = 2 if p_legal >= thresholds["recommend_probability"] else 1
        applied.append(("rule-internal-10pct", "text" if level == 2 else "below_text"))
    if p_large >= thresholds["large_probability"]:
        level = 4
        applied.append(("rule-internal-5000", "text"))

    # 고정 템플릿 사유마다 조항과 입력을 가진 근거 조각을 하나씩 붙인다.
    reasons, evidence = [], []
    inputs = {
        "eventId": event["id"],
        "hazards": hazards,
        "sampleCount": int(values.size),
        "probabilities": probabilities,
        "thresholds": thresholds,
    }
    for rule_id, text_key in applied:
        rule = settings["rules"][rule_id]
        text = rule[text_key]
        fragment = rule_evidence(rule_id, inputs, text=text)
        reasons.append(
            {
                "ruleId": rule_id,
                "kind": rule["kind"],
                "text": text,
                "clauseId": rule["clause_id"],
                "evidenceId": fragment["id"],
            }
        )
        evidence.append(fragment)

    # 규모 외 점검은 모든 등급에서 생성하고 대규모 사전 협의에는 판정 근거를 재사용한다.
    checks = checklist.build(event, weather)
    evidence.extend(checks.evidence)
    if level == 4:
        traffic = settings["rules"]["rule-internal-5000"]["checklist"]
        traffic_evidence = next(item["id"] for item in evidence if item["ruleId"] == "rule-internal-5000")
        checks.checklist.append(
            {**traffic, "ruleId": "rule-internal-5000", "evidenceIds": [traffic_evidence]}
        )
    judgment = {
        "basis": basis,
        "level": level,
        "label": settings["labels"][level],
        "ruleIds": [reason["ruleId"] for reason in reasons],
        "reasons": reasons,
        "checklist": checks.checklist,
    }

    # 등급·사유·근거는 그대로 두고 반환할 확률 표시만 같은 표본의 구간으로 바꾼다.
    if basis == "구간":
        p10, p90 = np.quantile(values, [0.1, 0.9])
        display = settings["interval_display"].format(p10=float(p10), p90=float(p90))
        probabilities = [{**item, "display": display} for item in probabilities]
    return JudgmentResult(judgment, probabilities, evidence)
