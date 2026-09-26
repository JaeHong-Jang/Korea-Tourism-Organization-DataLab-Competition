"""발표치 후보의 기존 자동 게이트와 두 평가 정의의 판정 재현율 안전 조건을 결합한다."""

from typing import Any


# 두 평가 중 하나라도 대상 이상 놓침이 늘면 자동 성적 게이트 통과와 무관하게 보류한다.
def promotion_review(
    gate: dict[str, Any], evaluations: dict[str, Any], upcoming: dict[str, Any]
) -> dict[str, Any]:
    safety = {}
    reasons = []
    for definition in ("conditional", "filename_sensitivity"):
        before, after = (evaluations[definition][name] for name in ("v1", "candidate"))
        old, new = before["judgmentRecall"], after["judgmentRecall"]
        passed = old is not None and new is not None and new >= old
        safety[definition] = {
            "passed": passed,
            "before": old,
            "after": new,
            "beforeMissed": before["missed"],
            "afterMissed": after["missed"],
        }
        if not passed:
            cause = "판정 재현율 미검증" if old is None or new is None else "판정 재현율 하락"
            reasons.append(f"{definition} {cause}")

    # 골든 미확보는 기존 게이트의 미검증 상태를 유지하고 실제 승격은 호출자에게도 허용하지 않는다.
    if gate["passed"] is False:
        reasons.append("기존 승격 게이트 미달")
    if not evaluations["conditional"]["candidate"]["announcedUsed"] or not upcoming["scaleSources"].get(
        "announced"
    ):
        reasons.append("발표치 계층 사용 0건으로 규모 구분 개선 미검증")
    proposal = "승격 후보 제안(골든 미검증)" if gate["passed"] is None else "승격 후보 제안"
    return {
        "recallSafety": safety,
        "promotionEligible": not reasons,
        "recommendation": "보류: " + "; ".join(reasons) if reasons else proposal,
    }
