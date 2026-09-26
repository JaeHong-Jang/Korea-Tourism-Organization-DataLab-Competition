"""계약 JSON의 실제 적재·문장 전이로 SHACL 정상 그래프를 준비한다."""

from copy import deepcopy

from contract_cases import SESSION_ID, memory_store, read_json
from knowledge.paths import CONTRACTS
from knowledge.store.facts import KnowledgeStore
from knowledge.store.repository import ID, MASTER, TBOX
from rdflib import Graph

CLAIM_ID = "c-yeongjong-3"
NUMBER_CLAIM_ID = "c-yeongjong-peak"


# 지정된 세 계약 픽스처를 쓰며 조건부 규칙용 문장·OOD 근거도 실제 적재한다.
def candidate_store(*, numeric: bool = False, ood: bool = False) -> KnowledgeStore:
    store = memory_store()
    event = read_json(CONTRACTS / "fixtures/event/valid-yeongjong.json")
    forecast = read_json(CONTRACTS / "fixtures/forecast/valid-yeongjong.json")
    claim = read_json(CONTRACTS / "fixtures/claim/valid-published.json")
    if ood:
        forecast["ood"] = True
        forecast["oodReasons"] = ["학습 범위 밖 행사 조건"]
        evidence = {
            **deepcopy(forecast["evidence"][1]),
            "id": "ev-yeongjong-ood",
            "kind": "check",
            "title": "참고용 — 담당자 검토 필수",
            "summary": "학습 범위 밖 조건이므로 참고용으로 검토한다",
            "checkResult": {"checkKind": "uncertainty", "passed": True, "revision": 0},
        }
        forecast["evidence"].append(evidence)
        claim["evidenceIds"].append(evidence["id"])
        claim["checks"].append({"checkKind": "uncertainty", "passed": True, "revision": 0})
    store.load_facts(SESSION_ID, "event", [event])
    store.load_facts(SESSION_ID, "forecast", [forecast])

    # 설명 유형에도 자리표시자를 넣어 수치 유형에만 숫자 검사를 제한하는 오류를 잡는다.
    claims = [claim]
    if numeric:
        number = deepcopy(claim)
        number.update(
            id=NUMBER_CLAIM_ID,
            claimType="설명",
            text="순간 최대 {{peak}}명으로 추정돼요",
            rendered="순간 최대 21000명으로 추정돼요",
            placeholders=[{"name": "peak", "quantityId": "q-f-yeongjong-2025-peak", "field": "p50"}],
        )
        number["checks"] = [check for check in number["checks"] if check["checkKind"] != "rule"]
        number["checks"].append({"checkKind": "number", "passed": True, "revision": 0})
        claims.append(number)

    # 새 문장은 draft로 넣고 그 내용 revision에서 검사한 candidate로 전이한다.
    drafts = [{**deepcopy(item), "status": "draft", "rendered": None, "checks": []} for item in claims]
    revision = store.load_facts(SESSION_ID, "claim", drafts)
    for item in claims:
        item["status"] = "candidate"
        for check in item["checks"]:
            check["revision"] = revision
    assert store.load_facts(SESSION_ID, "claim", claims) == revision
    return store


# 테스트도 전체 저장소 합집합 대신 검증 API와 같은 세 그래프만 사용한다.
def validation_graph(store: KnowledgeStore) -> Graph:
    graph = store.repository.read_graph(ID[SESSION_ID])
    graph += store.repository.read_graph(MASTER)
    graph += store.repository.read_graph(TBOX)
    return graph
