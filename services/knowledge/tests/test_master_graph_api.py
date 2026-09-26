"""전체 근거 지도 API의 한국어 표시·계보 방향·세션 격리·응답 계약을 검증한다."""

import re
from collections import Counter

import orjson
import pytest
from fastapi.testclient import TestClient
from knowledge.api import master_graph as route
from knowledge.api.app import create_app
from knowledge.api.contract_response import response_validator
from knowledge.paths import JSONLD
from knowledge.store.facts import KnowledgeStore
from knowledge.store.repository import CC, ID, MASTER
from lineage_cases import runtime_files
from rdflib import Graph, Literal
from rdflib.namespace import PROV, RDF

URL = "/v1/master/graph"


# 빈 런타임에서도 전체 클래스와 기준 정의가 한국어 이름·원문 주소로 열린다.
def test_static_master_graph_kinds_labels_and_sources() -> None:
    with TestClient(create_app(KnowledgeStore())) as client:
        response = client.get(URL)
    assert response.status_code == 200
    payload = response.json()
    response_validator("knowledge-graph").validate(payload)
    assert payload["masterVersion"] == 1
    assert Counter(node["kind"] for node in payload["nodes"]) == {
        "class": 43,
        "rule": 18,
        "clause": 1,
        "dataset": 14,
        "assumption": 10,
        "agent": 13,
    }
    nodes = {node["id"]: node for node in payload["nodes"]}
    assert len(nodes) == len(payload["nodes"]) <= 600
    assert nodes["cc:Event"]["label"] == "행사"
    assert nodes["cc:PipelineStage"]["label"] == "파이프라인 단계"
    assert nodes["agent-lead"]["label"] == "팀장"
    assert {"prov:Entity", "prov:Activity", "prov:Agent"} <= nodes.keys()
    assert all(re.search("[가-힣]", node["label"]) for node in nodes.values())

    # 계약 라벨과 원문 주소를 그대로 쓰며 가정의 값·범위·추정 표기를 보존한다.
    labels = orjson.loads((JSONLD / "master-labels.json").read_bytes())
    for section in ("rules", "clauses", "datasets"):
        for identifier, expected in labels[section].items():
            assert nodes[identifier]["label"] == expected["title"]
            if "url" in expected:
                assert nodes[identifier]["url"] == expected["url"]
            if section == "rules":
                assert expected["kind"] in nodes[identifier]["note"]
    note = nodes["as-peak-day-factor"]["note"]
    assert all(value in note for value in ("값: 1.0", "범위 하한: 0.8", "범위 상한: 1.2", "추정"))
    assert nodes["law-disaster-act-enf-73-9"]["url"].startswith("https://www.law.go.kr/법령/")


# 실제 수집·학습 계보에서 모든 종류와 사용·생성·파생 간선의 RDF 방향을 확인한다.
def test_runtime_lineage_edges_and_statuses() -> None:
    _, card = runtime_files()
    store = KnowledgeStore()
    with TestClient(create_app(store)) as client:
        response = client.get(URL)
    assert response.status_code == 200
    payload = response.json()
    response_validator("knowledge-graph").validate(payload)
    nodes = {node["id"]: node for node in payload["nodes"]}
    counts = Counter(node["kind"] for node in nodes.values())
    assert counts["model"] == 1 and counts["stage"] == 7 and counts["file"] > 0 and counts["other"] == 1
    assert counts["class"] == 43 and payload["masterVersion"] == 3
    assert all(re.search("[가-힣]", node["label"]) for node in nodes.values())
    edges = {(edge["source"], edge["predicate"], edge["target"]) for edge in payload["edges"]}
    assert ("rule-legal-1000", "rdf:type", "cc:LegalRule") in edges
    assert ("rule-legal-1000", "cc:basedOnClause", "law-disaster-act-enf-73-9") in edges
    assert ("cc:LegalRule", "cc:basedOnClause", "cc:LegalClause") in edges
    assert ("cc:LegalRule", "rdfs:subClassOf", "cc:Rule") in edges
    assert ("cc:Event", "cc:heldAt", "cc:Venue") in edges
    assert (card["id"], "rdf:type", "cc:ModelRun") in edges
    assert len(edges) == len(payload["edges"])
    for edge in payload["edges"]:
        assert edge["source"] in nodes and edge["target"] in nodes
        assert re.fullmatch(r"[a-z]+:[A-Za-z][A-Za-z0-9]*", edge["predicate"])
        assert re.search("[가-힣]", edge["label"])
        if edge["predicate"] == "rdf:type":
            assert edge["label"] == "종류"

    # 파일의 해시 유무가 달라도 원래 노드를 구분하고 실제 생성 방향을 바꾸지 않는다.
    graph = store.repository.read_graph(MASTER)
    for source, predicate, target in graph:
        if predicate in (PROV.used, PROV.wasGeneratedBy, PROV.wasDerivedFrom, PROV.wasInformedBy):
            source_id = str(source).removeprefix(str(ID))
            target_id = str(target).removeprefix(str(ID))
            predicate_id = "prov:" + str(predicate).removeprefix(str(PROV))
            assert (source_id, predicate_id, target_id) in edges
            if predicate == PROV.wasGeneratedBy:
                assert nodes[source_id]["kind"] == "file" and nodes[target_id]["kind"] == "stage"
    stages = [node for node in nodes.values() if node["kind"] == "stage"]
    assert any("게이트: 실패" in node["note"] for node in stages)
    assert any("게이트: 미검증" in node["note"] for node in stages)
    assert card["modelVersion"] in nodes[card["id"]]["note"]
    assert "검증: 미확인" in nodes[card["id"]]["note"]


# 같은 종류·id를 가진 세션 개체도 전체 지도와 생성 시각에 영향을 주지 않는다.
def test_session_graphs_are_never_read() -> None:
    store = KnowledgeStore()
    with TestClient(create_app(store)) as client:
        before = client.get(URL).content
        session = Graph()
        session.add((ID["ds-yeongjong-private"], RDF.type, CC.Dataset))
        session.add((ID["ds-yeongjong-private"], CC.note, Literal("비공개 영종 자료")))
        session.add((ID["rule-legal-1000"], CC.note, Literal("세션 전용 규칙")))
        store.repository.replace_graph(ID["s-yeongjong-private"], session)
        assert client.get(URL).content == before
        assert client.get("/v1/stats/graph").json()["sessions"] == 1


# 응답 생성 오류는 계약 검사에서 막고 내부 원문은 실패 보고서에 싣지 않는다.
@pytest.mark.parametrize("invalid", [[], {"masterVersion": 1, "internal": "비공개"}])
def test_master_graph_contract_failure(invalid: object, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(route, "master_graph", lambda repository: invalid)
    with TestClient(create_app(KnowledgeStore())) as client:
        response = client.get(URL)
    assert response.status_code == 500
    response_validator("gate-report").validate(response.json())
    assert "비공개" not in response.text
