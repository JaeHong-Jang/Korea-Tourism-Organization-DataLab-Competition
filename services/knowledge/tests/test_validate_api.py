"""검증·발행 API의 범위 고정, 계약 응답, 세션 격리와 원자성을 검증한다."""

from copy import deepcopy
from pathlib import Path

import pytest
from contract_cases import RDFLIB_NQUADS_WARNING, SESSION_ID, read_json
from fastapi.testclient import TestClient
from httpx import Response
from knowledge.api.app import create_app
from knowledge.convert.documents import schema_problems
from knowledge.paths import CONTRACTS
from knowledge.store.repository import CC, ID, MASTER
from rdflib import Graph, Literal, URIRef
from rdflib.compare import isomorphic
from rdflib.namespace import RDF
from shape_cases import CLAIM_ID, NUMBER_CLAIM_ID, candidate_store

pytestmark = pytest.mark.filterwarnings(RDFLIB_NQUADS_WARNING)
BASE = f"/v1/sessions/{SESSION_ID}"


# 모든 API 응답이 실제 계약 스키마를 통과하는지 공통으로 확인한다.
def assert_report(response: Response, *, passed: bool, status: int = 200) -> dict:
    assert response.status_code == status, response.text
    report = response.json()
    assert schema_problems(report, "gate-report") == []
    assert report["passed"] is passed
    return report


# 생략·단독·게이트별 목록은 같은 고정 범위에서 검사하고 규칙 오타는 거부한다.
@pytest.mark.parametrize(
    "shapes,gate", [(None, "B"), ("S03,S05,S06,S07,S08,S09", "A"), ("S01,S02,S11", "B"), ("S12", "publish")]
)
def test_validate_success_and_selection(shapes: str | None, gate: str) -> None:
    store = candidate_store(numeric=True, ood=True)
    params = {"revision": 3, "masterVersion": 2}
    if shapes is not None:
        params["shapes"] = shapes
    before = store.repository.read_graph(ID[SESSION_ID])
    with TestClient(create_app(store)) as client:
        report = assert_report(client.post(BASE + "/validate", params=params), passed=True)
    assert report == {"gate": gate, "passed": True, "revision": 3, "masterVersion": 2, "violations": []}
    assert isomorphic(before, store.repository.read_graph(ID[SESSION_ID]))


# 알 수 없는 규칙이나 범위 누락이 전체 검사 생략으로 이어지면 안 된다.
@pytest.mark.parametrize("extra", [{"shapes": "S99"}, {"shapes": ""}, {"shapes": "S01,"}])
def test_invalid_shapes(extra: dict) -> None:
    store = candidate_store()
    with TestClient(create_app(store)) as client:
        response = client.post(BASE + "/validate", params={"revision": 3, "masterVersion": 2, **extra})
        assert_report(response, passed=False, status=422)


# 두 API 모두 과거·미래 revision과 기준 버전 불일치를 쓰기 없이 거부한다.
@pytest.mark.parametrize("route", ["validate", "publish"])
@pytest.mark.parametrize("revision,version", [(2, 2), (4, 2), (3, 1), (3, 3)])
def test_scope_conflict(route: str, revision: int, version: int) -> None:
    store = candidate_store()
    before = store.repository.read_graph(ID[SESSION_ID])
    with TestClient(create_app(store)) as client:
        response = client.post(BASE + f"/{route}", params={"revision": revision, "masterVersion": version})
        report = assert_report(response, passed=False, status=409)
    assert (report["revision"], report["masterVersion"]) == (3, 2)
    assert isomorphic(before, store.repository.read_graph(ID[SESSION_ID]))


# 잘못된 쿼리도 예외 문자열 대신 계약 보고서로 응답한다.
@pytest.mark.parametrize("route", ["validate", "publish"])
@pytest.mark.parametrize("params", [{}, {"revision": -1, "masterVersion": 2}, {"revision": 3}])
def test_missing_scope(route: str, params: dict) -> None:
    with TestClient(create_app(candidate_store())) as client:
        assert_report(client.post(BASE + f"/{route}", params=params), passed=False, status=422)


# 다른 세션의 같은 ID 사실이 현재 세션에서 끊긴 관측값을 보충하지 못한다.
def test_validation_isolates_named_graphs() -> None:
    store = candidate_store()
    graph = store.repository.read_graph(ID[SESSION_ID])
    foreign = Graph()
    for triple in list(graph.triples((ID["obs-28110-sat-nonlocal"], None, None))):
        foreign.add(triple)
        graph.remove(triple)
    store.repository.replace_graph(ID[SESSION_ID], graph)
    store.repository.replace_graph(ID["s-seoul-2025"], foreign)
    with TestClient(create_app(store)) as client:
        response = client.post(
            BASE + "/validate", params={"revision": 3, "masterVersion": 2, "shapes": "S09"}
        )
        report = assert_report(response, passed=False)
    assert {item["shapeId"] for item in report["violations"]} == {"S09"}


# 기준 그래프와 TBox의 하위 클래스 관계가 실제 검증에 포함돼야 한다.
def test_validation_uses_master_and_tbox() -> None:
    store = candidate_store()
    with TestClient(create_app(store)) as client:
        params = {"revision": 3, "masterVersion": 2, "shapes": "S05,S06,S08"}
        assert_report(client.post(BASE + "/validate", params=params), passed=True)
        graph = store.repository.read_graph(MASTER)
        graph.remove((ID["mr-v0-1-0"], RDF.type, CC.ModelRun))
        store.repository.replace_graph(MASTER, graph)
        report = assert_report(client.post(BASE + "/validate", params=params), passed=False)
    assert "S08" in {item["shapeId"] for item in report["violations"]}


# 둘 중 한 후보의 검사만 실패해도 다른 후보까지 그대로 남아야 한다.
@pytest.mark.parametrize("failure", ["failed", "stale", "missing"])
def test_publish_failure_is_atomic(failure: str) -> None:
    store = candidate_store(numeric=True)
    graph = store.repository.read_graph(ID[SESSION_ID])
    check = next(graph.objects(ID[NUMBER_CLAIM_ID], CC.checkedBy))
    if failure == "failed":
        graph.set((check, CC.passed, Literal(False)))
    elif failure == "stale":
        graph.set((check, CC.checksRevision, Literal(0)))
    else:
        graph.remove((ID[NUMBER_CLAIM_ID], CC.checkedBy, None))
    store.repository.replace_graph(ID[SESSION_ID], graph)
    with TestClient(create_app(store)) as client:
        response = client.post(BASE + "/publish", params={"revision": 3, "masterVersion": 2})
        report = assert_report(response, passed=False)
    assert "S12" in {item["shapeId"] for item in report["violations"]}
    assert isomorphic(graph, store.repository.read_graph(ID[SESSION_ID]))
    assert all(claim["status"] == "candidate" for claim in store.scope(SESSION_ID)["claims"].values())


# S12 통과만으로 발행하지 않고 분석·문장 게이트 위반도 같은 범위에서 다시 거부한다.
@pytest.mark.parametrize(
    "fixture,expected",
    [
        ("s01-no-evidence", {"S01"}),
        ("s02-no-unit", {"S02"}),
        ("s07-one-assumption", {"S07"}),
        ("s09-future-availability", {"S09"}),
        ("s09-invalid-date", {"S03", "S09"}),
        ("s09-missing-observation", {"S08", "S09"}),
        ("s09-other-event-region", {"S09"}),
        ("s10-no-ood-evidence", {"S10"}),
        ("s11-no-agent", {"S11"}),
    ],
)
def test_publish_rechecks_all_shapes(fixture: str, expected: set[str]) -> None:
    store = candidate_store(numeric=True, ood=True)
    graph = store.repository.read_graph(ID[SESSION_ID])
    graph.update((Path(__file__).parent / "fixtures/shapes" / f"{fixture}.rq").read_text())
    store.repository.replace_graph(ID[SESSION_ID], graph)
    params = {"revision": 3, "masterVersion": 2}
    with TestClient(create_app(store)) as client:
        assert_report(client.post(BASE + "/validate", params={**params, "shapes": "S12"}), passed=True)
        validation = assert_report(client.post(BASE + "/validate", params=params), passed=False)
        report = assert_report(client.post(BASE + "/publish", params=params), passed=False)
    assert report["gate"] == "publish"
    assert (report["revision"], report["masterVersion"]) == (3, 2)
    assert {item["shapeId"] for item in validation["violations"]} == expected
    assert {item["shapeId"] for item in report["violations"]} == expected
    assert isomorphic(graph, store.repository.read_graph(ID[SESSION_ID]))
    assert all(claim["status"] == "candidate" for claim in store.scope(SESSION_ID)["claims"].values())


# 후보 전체를 단 한 번 저장하고 이미 거절된 문장은 그대로 남긴다.
def test_publish_changes_only_candidates_in_one_transaction(monkeypatch: pytest.MonkeyPatch) -> None:
    store = candidate_store(numeric=True)
    rejected = deepcopy(store.scope(SESSION_ID)["claims"][NUMBER_CLAIM_ID])
    rejected["status"] = "rejected"
    assert store.load_facts(SESSION_ID, "claim", [rejected]) == 3
    writes = []
    replace_graph = store.repository.replace_graph

    # 트랜잭션 입력에도 원문과 RDF 모두 같은 상태가 담겼는지 뒤에서 확인한다.
    def record_write(graph_id: URIRef, graph: Graph) -> None:
        writes.append(graph_id)
        replace_graph(graph_id, graph)

    monkeypatch.setattr(store.repository, "replace_graph", record_write)
    with TestClient(create_app(store)) as client:
        assert_report(client.post(BASE + "/publish", params={"revision": 3, "masterVersion": 2}), passed=True)
        assert_report(
            client.post(BASE + "/publish", params={"revision": 3, "masterVersion": 2}), passed=False
        )
    assert writes == [ID[SESSION_ID]]
    scope = store.scope(SESSION_ID)
    assert scope["revision"] == 3
    assert scope["claims"][CLAIM_ID]["status"] == "published"
    assert scope["claims"][NUMBER_CLAIM_ID]["status"] == "rejected"
    graph = store.repository.read_graph(ID[SESSION_ID])
    assert set(graph.objects(ID[CLAIM_ID], CC.status)) == {Literal("published")}
    assert set(graph.objects(ID[NUMBER_CLAIM_ID], CC.status)) == {Literal("rejected")}


# 검증 이후 기준 그래프를 갱신하면 예전 버전으로 발행할 수 없다.
def test_master_changes_between_validate_and_publish() -> None:
    store = candidate_store()
    with TestClient(create_app(store)) as client:
        params = {"revision": 3, "masterVersion": 2}
        assert_report(client.post(BASE + "/validate", params=params), passed=True)
        card = read_json(CONTRACTS / "fixtures/model-card/valid-v0-1-0.json")
        card["id"] = "mr-v0-2-0"
        assert store.master.register_model_run(card) == 3
        assert_report(client.post(BASE + "/publish", params=params), passed=False, status=409)
    assert store.scope(SESSION_ID)["claims"][CLAIM_ID]["status"] == "candidate"
