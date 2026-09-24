"""문서와 세션의 정의를 모아 충돌 및 내용 revision 변화를 판정한다."""

from copy import deepcopy
from typing import Any

from knowledge.convert.claim_lifecycle import facts_transition_problems, publish_problems
from knowledge.convert.documents import same_content

DEF_PREFIX = {
    "q-": "quantities",
    "ev-": "evidence",
    "obs-": "observations",
    "as-": "assumptions",
    "c-": "claims",
    "e-": "events",
    "f-": "forecasts",
}
DEF_KINDS = (*DEF_PREFIX.values(), "baselines", "similars")
Scope = dict[str, Any]


# 세션 밖 정의가 들어오지 않는 독립 범위를 만든다.
def empty_scope(session_id: str | None = None, revision: int | None = None) -> Scope:
    return {
        "sessionId": session_id,
        "revision": revision,
        "caseEvents": set(),
        "conflicts": [],
        **{kind: {} for kind in DEF_KINDS},
    }


# 검사 중 만든 충돌을 다음 검사에 물려주지 않는다.
def copy_scope(scope: Scope) -> Scope:
    result = deepcopy(scope)
    result["conflicts"] = []
    return result


# 평시는 지역과 기간을 묶어 하나의 불변 사실로 식별한다.
def baseline_key(doc: dict) -> str:
    return f"{doc['sigunguCode']}:{doc['period']['from']}:{doc['period']['to']}"


# 중첩 정의와 자연 키를 모으되 문장은 계약의 수명 주기로 판정한다.
def add_definitions(defs: Scope, schema: str, doc: dict, via: str = "facts") -> None:
    # 예보서 숫자 카드는 정의가 아니라 투영이므로 별도 비교에 맡긴다.
    def visit(node: Any, key: str | None = None) -> None:
        if isinstance(node, list):
            for item in node:
                visit(item)
            return
        if not isinstance(node, dict) or (schema == "forecast-report" and key == "card"):
            return
        node_id = node.get("id")
        kind = next(
            (
                kind
                for prefix, kind in DEF_PREFIX.items()
                if isinstance(node_id, str) and node_id.startswith(prefix)
            ),
            None,
        )
        if kind:
            previous = defs[kind].get(node_id)
            if kind == "claims" and schema == "claim":
                problems = (
                    publish_problems(previous)
                    if via == "publish"
                    else facts_transition_problems(previous, node)
                )
                defs["conflicts"].extend(problems)
            elif previous is not None and not same_content(previous, node):
                defs["conflicts"].append(f"같은 id {node_id}에 다른 내용")
            defs[kind][node_id] = deepcopy(node)
        for child_key, value in node.items():
            visit(value, child_key)

    # 자연 키가 같은 자료의 값 변경도 id 충돌과 똑같이 거부한다.
    def part(kind: str, key: str, node: dict) -> None:
        previous = defs[kind].get(key)
        if previous is not None and not same_content(previous, node):
            label = "평시" if kind == "baselines" else "유사 사례"
            defs["conflicts"].append(f"같은 {label} {key}에 다른 내용")
        defs[kind][key] = deepcopy(node)

    # 정의를 다 모은 뒤 사례 참조가 자기 문서 안에서도 풀리게 한다.
    visit(doc)
    similars = (
        [doc] if schema == "similar-event" else doc.get("similar", []) if schema == "forecast-report" else []
    )
    baselines = (
        [doc]
        if schema == "region-baseline"
        else ([doc["baseline"]] if schema == "forecast-report" and doc.get("baseline") else [])
    )
    for similar in similars:
        defs["caseEvents"].add(similar["eventId"])
        part("similars", similar["eventId"], similar)
    for baseline in baselines:
        part("baselines", baseline_key(baseline), baseline)


# 저장 그래프에서 읽은 현재 문서들로 sessionScope와 같은 모양을 만든다.
def session_scope(session_id: str, loaded: list[dict], revision: int) -> Scope:
    defs = empty_scope(session_id, revision)
    for record in loaded:
        add_definitions(defs, record["schema"], record["doc"], record.get("via", "facts"))
    return defs


# 새 정의가 하나라도 있으면 요청의 내용 revision을 한 번 올린다.
def changes_content(scope: Scope, schema: str, doc: dict) -> bool:
    probe = empty_scope()
    add_definitions(probe, schema, doc)
    return any(
        node_id not in scope[kind] or (kind != "claims" and not same_content(scope[kind][node_id], node))
        for kind in DEF_KINDS
        for node_id, node in probe[kind].items()
    )
