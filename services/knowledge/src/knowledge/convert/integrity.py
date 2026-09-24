"""계약 integrity.mjs와 같은 범위에서 모든 참조를 판정한다."""

from typing import Any

from knowledge.convert.definitions import Scope, add_definitions, copy_scope, empty_scope
from knowledge.convert.report_integrity import ids, report_problems

REF_KEYS = {
    "evidenceId": "evidence",
    "evidenceIds": "evidence",
    "quantityId": "quantities",
    "quantityIds": "quantities",
    "observationIds": "observations",
    "assumptionId": "assumptions",
    "assumptionIds": "assumptions",
    "caseEventId": "caseEvents",
    "claimIds": "claims",
    "ruleId": "rules",
    "ruleIds": "rules",
    "clauseId": "clauses",
    "datasetId": "datasets",
    "modelRunId": "modelRuns",
}
FROM_MASTER = {"rules", "clauses", "datasets", "modelRuns"}
Master = dict[str, set[str]]


# 목록 참조와 중첩 참조를 계약의 경로 표기로 수집한다.
def refs_in(node: Any, path: str = "") -> list[tuple[str, str, str]]:
    out = []
    if isinstance(node, list):
        for index, item in enumerate(node):
            out.extend(refs_in(item, f"{path}[{index}]"))
    elif isinstance(node, dict):
        for key, value in node.items():
            if key in REF_KEYS:
                for node_id in value if isinstance(value, list) else [value]:
                    if isinstance(node_id, str):
                        out.append((key, node_id, f"{path}.{key}"))
            out.extend(refs_in(value, f"{path}.{key}"))
    return out


# 가정은 문서·세션에 정의가 전혀 없을 때만 기준 그래프에서 푼다.
def resolves(where: str, node_id: str, defs: Scope, master: Master) -> bool:
    if where in FROM_MASTER:
        return node_id in master[where]
    if where == "assumptions" and not defs["assumptions"]:
        return node_id in master["assumptions"]
    return node_id in defs[where]


# 자리표시자의 대상 수치가 있어도 지정한 칸이 비어 있으면 거부한다.
def placeholder_problems(node: Any, quantities: dict) -> list[str]:
    out = []
    if isinstance(node, list):
        for item in node:
            out.extend(placeholder_problems(item, quantities))
    elif isinstance(node, dict):
        for placeholder in node.get("placeholders", []):
            quantity = quantities.get(placeholder["quantityId"])
            if quantity is not None and quantity.get(placeholder["field"]) is None:
                out.append(
                    f"{node.get('id', 'undefined')} 자리표시자 {placeholder['name']} → "
                    f"{placeholder['quantityId']}.{placeholder['field']}이 비었다"
                )
        for value in node.values():
            out.extend(placeholder_problems(value, quantities))
    return out


# 종류에 따라 같은 세션·예보·행사·검사 revision인지 확인한다.
def context_problems(doc: dict, kind: str, defs: Scope, master: Master, scope: Scope | None) -> list[str]:
    out = []

    # 독립 근거와 사례 안 근거는 존재하는 예보를 가리켜야 한다.
    def forecast_of(evidence: dict) -> list[str]:
        forecast_id = evidence.get("forecastId")
        if forecast_id and forecast_id not in defs["forecasts"]:
            return [f"evidence {evidence['id']} → 예보 {forecast_id} 없음"]
        return []

    # 예보의 행사 참조는 적재 전 세션 범위에서만 찾는다.
    if kind == "forecast":
        if scope is not None and doc["eventId"] not in scope["events"]:
            out.append(f"forecast → 행사 {doc['eventId']}가 세션에 없음")
        for evidence in doc["evidence"]:
            if evidence.get("forecastId") and evidence["forecastId"] != doc["id"]:
                out.append(f"evidence {evidence['id']} → 다른 예보 {evidence['forecastId']}")
    if kind == "claim":
        if doc["sessionId"] != defs["sessionId"]:
            out.append(f"claim {doc['id']} → 다른 세션 {doc['sessionId']}")
        if doc["forecastId"] not in defs["forecasts"]:
            out.append(f"claim {doc['id']} → 예보 {doc['forecastId']} 없음")
        agent_id = doc["generatedBy"]["agentId"]
        if f"agent-{agent_id}" not in master["agents"]:
            out.append(f"claim {doc['id']} → 에이전트 {agent_id} 기준 그래프에 없음")
        if scope is not None and scope.get("revision") is not None:
            for check in doc["checks"]:
                if check["revision"] > scope["revision"]:
                    out.append(
                        f"claim {doc['id']} {check['checkKind']} 검사 revision "
                        f"{check['revision']}은 아직 없다"
                        f"(지금 {scope['revision']})"
                    )
    if kind == "evidence":
        out.extend(forecast_of(doc))
    if kind in {"similar-event", "region-baseline"}:
        if doc["evidenceId"] not in ids(doc["evidence"]):
            out.append(f"→ 근거 {doc['evidenceId']}가 자기 evidence에 없음")
        for evidence in doc["evidence"]:
            out.extend(forecast_of(evidence))
    if kind == "forecast-report":
        out.extend(report_problems(doc))
    return out


# 호출자의 범위는 바꾸지 않고 문서 정의를 합쳐 참조와 충돌을 판정한다.
def integrity_problems(obj: dict, schema: str, master: Master, scope: Scope | None = None) -> list[str]:
    defs = (
        empty_scope(scope.get("sessionId") if scope else None)
        if schema == "forecast-report" or scope is None
        else copy_scope(scope)
    )
    add_definitions(defs, schema, obj)
    out = list(defs["conflicts"])
    for key, node_id, path in refs_in(obj):
        if not resolves(REF_KEYS[key], node_id, defs, master):
            out.append(f"{path} → {node_id} 없음")

    # 새로 정의한 가정은 위치와 관계없이 등록된 가정이어야 한다.
    own = empty_scope()
    add_definitions(own, schema, obj)
    out.extend(
        f"assumption {node_id} 기준 그래프에 없음"
        for node_id in own["assumptions"]
        if node_id not in master["assumptions"]
    )
    out.extend(placeholder_problems(obj, defs["quantities"]))
    out.extend(context_problems(obj, schema, defs, master, scope))
    return out
