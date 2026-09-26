"""발행 조회 API의 공개 경계·근거 원문 복원·재시작을 검증한다."""

import gc
import json
from copy import deepcopy
from pathlib import Path

import pytest
from contract_cases import RDFLIB_NQUADS_WARNING, SESSION_ID, memory_store, read_json
from fastapi.testclient import TestClient
from knowledge.api.app import create_app
from knowledge.convert.documents import same_content, schema_problems
from knowledge.convert.jsonld import contract_context
from knowledge.paths import CONTRACTS, ONTOLOGY
from knowledge.store.facts import KnowledgeStore
from knowledge.store.repository import CC, ID
from query_cases import add_claim, load_sequence, publish_session, sequence
from rdflib import Graph, Literal
from rdflib.compare import isomorphic
from rdflib.namespace import RDF

pytestmark = pytest.mark.filterwarnings(RDFLIB_NQUADS_WARNING)
BASE = f"/v1/sessions/{SESSION_ID}"


# 후보에서 두 조회가 모두 404이고 SHACL 발행 뒤에만 계약 응답이 열린다.
def test_candidate_to_published_reads() -> None:
    store = memory_store()
    load_sequence(store, publish=False)
    with TestClient(create_app(store)) as client:
        for path in ["/v1/claims/c-yeongjong-3/evidence", "/v1/evidence/ev-rule-legal-hazard"]:
            response = client.get(path)
            assert response.status_code == 404
            assert schema_problems(response.json(), "gate-report") == []
        assert client.get(BASE + "/graph").json().get("@graph", []) == []
        publish_session(client, store)
        cards = client.get("/v1/claims/c-yeongjong-4/evidence")
        assert cards.status_code == 200
        assert [card["id"] for card in cards.json()] == [
            "ev-model-f-yeongjong-2025",
            "ev-as-concurrency-fireworks",
        ]
        for card in cards.json():
            response = client.get(f"/v1/evidence/{card['id']}")
            assert response.status_code == 200
            assert schema_problems(response.json(), "evidence") == []
            assert same_content(response.json(), card)


# 원문 저장 경로를 다시 열어도 6종 근거의 null·배열 순서·중첩 필드가 같아야 한다.
def test_all_evidence_kinds_roundtrip_after_restart(tmp_path: Path) -> None:
    store = KnowledgeStore(tmp_path / "knowledge")
    store.master.register_model_run(read_json(CONTRACTS / "fixtures/model-card/valid-v0-1-0.json"))
    case = load_sequence(store)
    originals = {}
    for step in case["steps"]:
        for card in step.get("doc", {}).get("evidence", []):
            originals[card["id"]] = deepcopy(card)
    check = {
        **deepcopy(originals["ev-model-f-yeongjong-2025"]),
        "id": "ev-yeongjong-source-check",
        "kind": "check",
        "title": "영종 예보 근거 확인",
        "summary": "자료 공개일 확인 결과",
        "modelVersion": None,
        "checkResult": {"checkKind": "evidence", "passed": True, "revision": 6},
    }
    store.load_facts(SESSION_ID, "evidence", [check])
    originals[check["id"]] = check
    ordered_ids = list(reversed(originals))
    claim = add_claim(store, ordered_ids)
    with TestClient(create_app(store)) as client:
        publish_session(client, store)
    del client, store
    gc.collect()

    # 재시작은 프로세스 내 복원 캐시가 원문 불일치를 가리는 오류를 잡는다.
    restored = KnowledgeStore(tmp_path / "knowledge")
    with TestClient(create_app(restored)) as client:
        response = client.get(f"/v1/claims/{claim['id']}/evidence")
        assert response.status_code == 200
        assert [card["id"] for card in response.json()] == ordered_ids
        assert {card["kind"] for card in response.json()} == {
            "data",
            "case",
            "model",
            "rule",
            "assumption",
            "check",
        }
        for expected in originals.values():
            response = client.get(f"/v1/evidence/{expected['id']}")
            assert response.status_code == 200
            assert schema_problems(response.json(), "evidence") == []
            assert same_content(response.json(), expected)
            assert json.dumps(response.json(), sort_keys=True) == json.dumps(expected, sort_keys=True)


# 예보가 공개되어도 그 안의 미인용 근거와 새 비발행 문장·원문은 노출하지 않는다.
@pytest.mark.parametrize("status", ["draft", "candidate", "rejected"])
def test_graph_hides_unpublished_nodes_and_internal_documents(status: str) -> None:
    store = memory_store()
    load_sequence(store)
    card = deepcopy(store.scope(SESSION_ID)["evidence"]["ev-rule-legal-hazard"])
    card.update(id="ev-yeongjong-private", summary="비공개 근거 원문")
    store.load_facts(SESSION_ID, "evidence", [card])
    claim = deepcopy(sequence()["steps"][4]["doc"])
    claim.update(id="c-yeongjong-private", text="비공개 문장 원문", evidenceIds=[card["id"]])
    store.load_facts(SESSION_ID, "claim", [claim])
    if status == "candidate":
        claim.update(
            status=status,
            rendered=claim["text"],
            checks=[
                {"checkKind": kind, "passed": True, "revision": store.scope(SESSION_ID)["revision"]}
                for kind in ["evidence", "rule"]
            ],
        )
    else:
        claim["status"] = status
    store.load_facts(SESSION_ID, "claim", [claim])
    with TestClient(create_app(store)) as client:
        for path in [
            f"/v1/claims/{claim['id']}/evidence",
            f"/v1/evidence/{card['id']}",
            "/v1/evidence/ev-rule-internal-5000",
        ]:
            assert client.get(path).status_code == 404
        response = client.get(BASE + "/graph")
        assert response.status_code == 200
        assert response.json()["@context"] == contract_context()[0]["@context"]
        assert "비공개" not in response.text
        graph = Graph().parse(data=response.text, format="json-ld")
        assert set(graph.subjects(RDF.type, CC.Claim)) == {ID["c-yeongjong-3"], ID["c-yeongjong-4"]}
        assert set(graph.objects(None, CC.status)) == {Literal("published")}
        for node in [card["id"], claim["id"], "ev-rule-internal-5000", "ev-as-peak-day-factor"]:
            assert list(graph.triples((ID[node], None, None))) == []
            assert list(graph.triples((None, None, ID[node]))) == []
        for predicate in [CC.sourceDocument, CC.loadedDocument, CC.documentOrder, CC.documentSchema]:
            assert list(graph.triples((None, predicate, None))) == []
        assert (ID["f-yeongjong-2025"], RDF.type, CC.Forecast) in graph
        assert (ID["mr-v0-1-0"], RDF.type, CC.ModelRun) in graph
        assert (ID["obs-28110-sat-nonlocal"], RDF.type, CC.Observation) in graph


# 두 세션의 id가 다를 때 그래프와 카드에 다른 세션의 값이 끼어들지 않는다.
def test_read_api_isolates_sessions() -> None:
    store = memory_store()
    load_sequence(store)
    load_sequence(store, case=sequence("s-yeongjong-retry", "-retry"))
    with TestClient(create_app(store)) as client:
        response = client.get(BASE + "/graph")
        assert response.status_code == 200
        assert "-retry" not in response.text
        cards = client.get("/v1/claims/c-yeongjong-4/evidence").json()
        assert all(not card["id"].endswith("-retry") for card in cards)
        assert client.get("/v1/evidence/ev-baseline-28110-retry").status_code == 404


# 동일 id가 두 세션에 존재하면 세션 없는 계약 URL은 잘못된 원문을 고르지 않는다.
def test_ambiguous_resource_ids_fail_closed() -> None:
    store = memory_store()
    load_sequence(store)
    load_sequence(store, publish=False, case=sequence("s-yeongjong-retry"))
    with TestClient(create_app(store)) as client:
        assert client.get("/v1/claims/c-yeongjong-3/evidence").status_code == 404
        assert client.get("/v1/evidence/ev-rule-legal-hazard").status_code == 404
        assert "published" in client.get(BASE + "/graph").text
        assert client.get("/v1/sessions/s-yeongjong-retry/graph").json().get("@graph", []) == []


# 기준 온톨로지는 유효한 Turtle이고 세션 인스턴스나 저장 원문을 포함하지 않는다.
def test_ontology_and_missing_resources() -> None:
    with TestClient(create_app(memory_store())) as client:
        response = client.get("/v1/ontology")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/turtle")
        graph = Graph().parse(data=response.text, format="turtle")
        assert isomorphic(graph, Graph().parse(ONTOLOGY / "crowdcast.ttl", format="turtle"))
        for path in ["/v1/claims/c-yeongjong-absent/evidence", "/v1/evidence/ev-yeongjong-absent"]:
            assert client.get(path).status_code == 404
        assert client.get("/v1/sessions/s-yeongjong-absent/graph").json().get("@graph", []) == []
