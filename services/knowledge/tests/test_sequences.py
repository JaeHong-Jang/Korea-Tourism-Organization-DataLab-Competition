"""계약의 적재·전이·발행 순서와 각 단계의 내용 revision을 검증한다."""

from pathlib import Path

import pytest
from contract_cases import INTEGRITY, RDFLIB_NQUADS_WARNING, memory_store, read_json
from fastapi.testclient import TestClient
from knowledge.api.app import create_app
from knowledge.convert.documents import schema_problems
from knowledge.store.facts import IntegrityError
from knowledge.store.repository import CC, ID
from rdflib import Literal
from rdflib.compare import isomorphic

SEQUENCES = sorted((INTEGRITY / "sequences").glob("*.json"))


# 공개 facts API와 내부 발행 전이로 계약에 적힌 모든 단계를 재현한다.
@pytest.mark.filterwarnings(RDFLIB_NQUADS_WARNING)
@pytest.mark.parametrize("path", SEQUENCES, ids=lambda path: path.stem)
def test_sequence(path: Path) -> None:
    case = read_json(path)
    session_id = case["sessionId"]
    store = memory_store()
    failed = False
    with TestClient(create_app(store)) as client:
        for step in case["steps"]:
            before_revision = store.scope(session_id)["revision"]
            before_graph = store.repository.read_graph(ID[session_id])
            if "facts" in step:
                response = client.post(
                    f"/v1/sessions/{session_id}/facts", json={"schema": step["facts"], "items": [step["doc"]]}
                )
                report = response.json() if response.status_code == 422 else None
                revision = response.json()["revision"]
                assert response.status_code in {200, 422}, response.text
            else:
                try:
                    revision = store.publish(session_id, step["publish"])
                    report = None
                except IntegrityError as error:
                    report = error.report
                    revision = report["revision"]
            if "revisionAfter" in step:
                assert revision == step["revisionAfter"]
            if report is not None:
                failed = True
                assert path.name.startswith("invalid-"), report
                assert schema_problems(report, "gate-report") == []
                assert revision == before_revision == store.scope(session_id)["revision"]
                assert isomorphic(before_graph, store.repository.read_graph(ID[session_id]))
                break

            # 문장 트리플에는 현재 상태와 현재 검사만 남아야 한다.
            graph = store.repository.read_graph(ID[session_id])
            for claim_id, claim in store.scope(session_id)["claims"].items():
                assert set(graph.objects(ID[claim_id], CC.status)) == {Literal(claim["status"])}
                checks = list(graph.objects(ID[claim_id], CC.checkedBy))
                assert len(checks) == len(claim["checks"])
                assert sorted(int(graph.value(check, CC.checksRevision)) for check in checks) == sorted(
                    check["revision"] for check in claim["checks"]
                )
    assert failed == path.name.startswith("invalid-")
