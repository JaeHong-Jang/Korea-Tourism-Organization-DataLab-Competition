"""파일이 많은 전체 지도에서 크기 제한·연결 보존·초과 실패를 검증한다."""

import pytest
from fastapi.testclient import TestClient
from knowledge.api.app import create_app
from knowledge.api.contract_response import response_validator
from knowledge.query.graph_view import master_graph
from knowledge.store.facts import KnowledgeStore
from knowledge.store.repository import CC, ID, MASTER
from rdflib import Literal
from rdflib.namespace import PROV, RDF


# 같은 경로의 다른 버전과 여러 폴더의 파일 모두 묶되 입력·출력·출처 간선은 남긴다.
@pytest.mark.parametrize("layout", ["same-path", "one-folder", "many-folders"])
def test_large_file_graph_preserves_connections(layout: str) -> None:
    store = KnowledgeStore()
    graph = store.repository.read_graph(MASTER)
    stage = ID["st-yeongjong-fetch"]
    graph.add((stage, RDF.type, CC.PipelineStage))
    graph.add((stage, CC.name, Literal("crowdcast/fetch")))
    for index in range(700):
        file = ID[f"file-yeongjong-{index:04d}"]
        path = {
            "same-path": "data/raw/datalab/diy/영종도불꽃축제.csv",
            "one-folder": f"data/raw/datalab/diy/영종도불꽃축제-{index:04d}.csv",
            "many-folders": f"data/raw/datalab/diy/{index:04d}/영종도불꽃축제.csv",
        }[layout]
        graph.add((file, RDF.type, PROV.Entity))
        graph.add((file, CC.filePath, Literal(path)))
        graph.add((stage, PROV.used, file))
        graph.add((file, PROV.wasGeneratedBy, stage))
        graph.add((file, PROV.wasDerivedFrom, ID["ds-datalab-diy"]))
    store.repository.replace_graph(MASTER, graph)
    payload = master_graph(store.repository)
    response_validator("knowledge-graph").validate(payload)
    assert payload == master_graph(store.repository)
    nodes = {node["id"]: node for node in payload["nodes"]}
    assert len(nodes) <= 600
    grouped = [node for node in nodes.values() if node["kind"] == "file"]
    assert grouped and all("700개 파일 노드" in node["note"] for node in grouped)
    edges = {(edge["source"], edge["predicate"], edge["target"]) for edge in payload["edges"]}
    for node in grouped:
        assert ("st-yeongjong-fetch", "prov:used", node["id"]) in edges
        assert (node["id"], "prov:wasGeneratedBy", "st-yeongjong-fetch") in edges
        assert (node["id"], "prov:wasDerivedFrom", "ds-datalab-diy") in edges
        assert (node["id"], "rdf:type", "prov:Entity") in edges
    assert all(source in nodes and target in nodes for source, _, target in edges)


# 줄일 수 없는 기준 개체가 한도를 넘으면 임의 누락한 성공 응답을 만들지 않는다.
def test_non_file_overflow_fails_closed() -> None:
    store = KnowledgeStore()
    graph = store.repository.read_graph(MASTER)
    for index in range(600):
        graph.add((ID[f"mr-yeongjong-{index:04d}"], RDF.type, CC.ModelRun))
    store.repository.replace_graph(MASTER, graph)
    with TestClient(create_app(store), raise_server_exceptions=False) as client:
        response = client.get("/v1/master/graph")
    assert response.status_code == 500
    response_validator("gate-report").validate(response.json())
