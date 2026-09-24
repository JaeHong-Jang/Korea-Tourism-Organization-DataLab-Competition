"""무결성 픽스처를 실제 세션에 적재하고 계약 JavaScript 판정과 비교한다."""

import json
import subprocess
from pathlib import Path

import pytest
from contract_cases import INTEGRITY, RDFLIB_NQUADS_WARNING, SESSION_ID, load_before, memory_store, read_json
from fastapi.testclient import TestClient
from knowledge.api.app import create_app
from knowledge.convert import integrity_problems
from knowledge.convert.documents import schema_problems
from knowledge.paths import CONTRACTS, JSONLD, REPO_ROOT
from knowledge.store.repository import ID
from rdflib.compare import isomorphic

CASES = sorted(path for path in INTEGRITY.glob("*/*.json") if path.parent.name != "sequences")


# 계약 구현은 파일을 수정하지 않고 별도 Node 프로세스에서 판정 기준으로 실행한다.
def node_problems(doc: dict, schema: str, loaded: list[dict], revision: int) -> list[str]:
    script = """
import { refProblems, masterSets, sessionScope } from './packages/contracts/rules/integrity.mjs';
let input = ''; for await (const chunk of process.stdin) input += chunk;
const d = JSON.parse(input);
const scope = d.schema === 'forecast-report' ? null : sessionScope(d.sessionId, d.loaded, d.revision);
console.log(JSON.stringify(refProblems(d.doc, d.schema, masterSets(d.master, d.modelRuns), scope)));
"""
    data = {
        "doc": doc,
        "schema": schema,
        "loaded": loaded,
        "revision": revision,
        "sessionId": SESSION_ID,
        "master": read_json(JSONLD / "master-ids.json"),
        "modelRuns": [
            read_json(path)["id"] for path in (CONTRACTS / "fixtures/model-card").glob("valid-*.json")
        ],
    }
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        input=json.dumps(data),
        capture_output=True,
        text=True,
        check=True,
        cwd=REPO_ROOT,
        timeout=10,
    )
    return json.loads(result.stdout)


# 같은 적재 순서와 범위에서 valid·invalid 및 문제 메시지까지 일치해야 한다.
@pytest.mark.filterwarnings(RDFLIB_NQUADS_WARNING)
@pytest.mark.parametrize("path", CASES, ids=lambda path: f"{path.parent.name}/{path.stem}")
def test_integrity_matches_contract_and_api(path: Path) -> None:
    schema = path.parent.name
    doc = read_json(path)
    store = memory_store()
    loaded = load_before(store, schema)
    scope = None if schema == "forecast-report" else store.scope(SESSION_ID)
    revision = scope["revision"] if scope else 0
    problems = integrity_problems(doc, schema, store.master.snapshot()[1], scope)
    assert (not problems) == path.name.startswith("valid-"), problems
    assert sorted(problems) == sorted(node_problems(doc, schema, loaded, revision))

    # 예보서는 출력 스냅샷이므로 적재하지 않고 나머지는 실제 HTTP 응답도 검사한다.
    if schema == "forecast-report":
        return
    before = store.repository.read_graph(ID[SESSION_ID])
    with TestClient(create_app(store)) as client:
        response = client.post(f"/v1/sessions/{SESSION_ID}/facts", json={"schema": schema, "items": [doc]})
    if problems:
        assert response.status_code == 422
        report = response.json()
        assert schema_problems(report, "gate-report") == []
        assert report["gate"] == "integrity"
        assert all(item["check"] == "integrity" and item["nodeId"] for item in report["violations"])
        assert report["revision"] == revision == store.scope(SESSION_ID)["revision"]
        assert isomorphic(before, store.repository.read_graph(ID[SESSION_ID]))
    else:
        assert response.status_code == 200, response.json()


# 다른 세션에 있는 수치나 근거를 찾아 참조를 통과시키면 안 된다.
@pytest.mark.filterwarnings(RDFLIB_NQUADS_WARNING)
def test_other_session_facts_do_not_resolve() -> None:
    store = memory_store()
    load_before(store, "claim")
    claim = read_json(INTEGRITY / "claim/valid-draft.json")
    claim["sessionId"] = "s-separate-yeongjong"
    with TestClient(create_app(store)) as client:
        response = client.post(
            "/v1/sessions/s-separate-yeongjong/facts", json={"schema": "claim", "items": [claim]}
        )
    assert response.status_code == 422
    assert response.json()["revision"] == 0
    assert store.scope(SESSION_ID)["revision"] == 4
