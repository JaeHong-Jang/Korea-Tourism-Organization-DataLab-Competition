"""조회 테스트에서 계약의 사실 적재·후보 전이·SHACL 발행 순서를 재현한다."""

from copy import deepcopy
from typing import Any

from contract_cases import INTEGRITY, SESSION_ID, read_json
from fastapi.testclient import TestClient
from knowledge.api.app import create_app
from knowledge.store.facts import KnowledgeStore


# 다른 세션 실험은 기준 id를 유지하고 세션 사실 id만 선택적으로 바꾼다.
def sequence(session_id: str = SESSION_ID, suffix: str = "") -> dict:
    case = read_json(INTEGRITY / "sequences/valid-new-forecast.json")

    # 중첩 문서와 참조에 같은 id 치환을 적용해 계약 무결성을 보존한다.
    def replace(value: Any) -> Any:
        if isinstance(value, list):
            return [replace(item) for item in value]
        if isinstance(value, dict):
            return {key: replace(item) for key, item in value.items()}
        if value == SESSION_ID:
            return session_id
        if isinstance(value, str) and value.startswith(("e-", "f-", "ev-", "q-", "obs-", "pr-", "c-", "st-")):
            return value + suffix
        return value

    return replace(case)


# 수용 기준의 순서를 HTTP API로 실행해 검증 우회 발행을 쓰지 않는다.
def load_sequence(store: KnowledgeStore, *, publish: bool = True, case: dict | None = None) -> dict:
    case = case or sequence()
    session_id = case["sessionId"]
    with TestClient(create_app(store)) as client:
        for step in case["steps"]:
            if "facts" in step:
                response = client.post(
                    f"/v1/sessions/{session_id}/facts", json={"schema": step["facts"], "items": [step["doc"]]}
                )
                assert response.status_code == 200, response.text
            elif publish:
                publish_session(client, store, session_id)
    return case


# 실제 현재 revision과 기준 버전으로 발행하고 게이트 성공까지 확인한다.
def publish_session(client: TestClient, store: KnowledgeStore, session_id: str = SESSION_ID) -> None:
    response = client.post(
        f"/v1/sessions/{session_id}/publish",
        params={"revision": store.scope(session_id)["revision"], "masterVersion": store.master.snapshot()[0]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["passed"], response.text


# 근거 여러 개를 인용하는 설명 문장을 draft에서 현재 revision의 candidate로 옮긴다.
def add_claim(store: KnowledgeStore, evidence_ids: list[str], claim_id: str = "c-yeongjong-sources") -> dict:
    draft = deepcopy(sequence()["steps"][4]["doc"])
    draft.update(id=claim_id, claimType="설명", evidenceIds=evidence_ids)
    draft["generatedBy"]["stepId"] = "st-yeongjong-sources"
    revision = store.load_facts(SESSION_ID, "claim", [draft])
    candidate = {
        **draft,
        "status": "candidate",
        "rendered": draft["text"],
        "checks": [{"checkKind": "evidence", "passed": True, "revision": revision}],
    }
    store.load_facts(SESSION_ID, "claim", [candidate])
    return candidate
