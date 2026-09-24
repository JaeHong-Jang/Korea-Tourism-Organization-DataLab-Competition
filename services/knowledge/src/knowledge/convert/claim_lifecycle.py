"""계약의 문장 적재 전이와 최소 발행 전이를 판정한다."""

from knowledge.convert.documents import same_content

FROZEN = ("sessionId", "forecastId", "text", "claimType", "evidenceIds", "placeholders", "generatedBy")
TRANSITIONS = {"draft": {"candidate", "rejected"}, "candidate": {"rejected"}}


# 검사 종류를 유지하면서 모든 검사가 이전보다 더 새 revision인지 본다.
def rechecked_later(previous: list[dict], current: list[dict]) -> bool:
    previous_max = max((check["revision"] for check in previous), default=float("-inf"))
    return (
        bool(current)
        and {check["checkKind"] for check in previous} == {check["checkKind"] for check in current}
        and all(check["revision"] > previous_max for check in current)
    )


# 같은 내용은 재시도로 허용하고 나머지는 동결 칸과 상태 전이를 검사한다.
def facts_transition_problems(previous: dict | None, current: dict) -> list[str]:
    claim_id = current["id"]
    if previous is None:
        if current["status"] == "draft":
            return []
        return [f"claim {claim_id}: 새 문장은 draft로만 적재한다(받은 상태 {current['status']})"]
    if same_content(previous, current):
        return []
    out = [
        f"claim {claim_id}: {key}는 바꿀 수 없다(재작성은 새 id로)"
        for key in FROZEN
        if not same_content(previous.get(key), current.get(key))
    ]
    before, after = previous["status"], current["status"]
    if before == after:
        recheck = (
            before == "candidate"
            and same_content(previous.get("rendered"), current.get("rendered"))
            and rechecked_later(previous["checks"], current["checks"])
        )
        if not recheck:
            out.append(
                f"claim {claim_id}: 상태 {before} 그대로는 더 새 revision의 검사 결과로만 바꿀 수 있다"
                "(본문은 그대로)"
            )
    elif after == "published":
        out.append(f"claim {claim_id}: 발행은 /publish로만 한다")
    elif after not in TRANSITIONS.get(before, set()):
        out.append(f"claim {claim_id}: {before} → {after} 전이는 허용되지 않는다")
    return out


# T-602의 SHACL 발행 게이트 전에 필요한 계약 전이만 검사한다.
def publish_problems(previous: dict | None, revision: int | None = None) -> list[str]:
    if previous is None:
        return ["없는 문장은 발행할 수 없다"]
    claim_id = previous["id"]
    if previous["status"] != "candidate":
        return [f"claim {claim_id}: {previous['status']} 상태는 발행할 수 없다(candidate만)"]
    out = []
    for check in previous["checks"]:
        if not check["passed"]:
            out.append(f"claim {claim_id}: {check['checkKind']} 검사 실패")
        if revision is not None and check["revision"] != revision:
            out.append(
                f"claim {claim_id}: {check['checkKind']} 검사가 revision {check['revision']} 기준"
                f"(지금 {revision}) — 다시 검사해야 한다"
            )
    return out
