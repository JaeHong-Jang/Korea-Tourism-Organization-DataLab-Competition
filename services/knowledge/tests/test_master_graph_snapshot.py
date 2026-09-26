"""전체 지도의 순서·생성 시각·버전 변경·동시 조회 결정성을 검증한다."""

import gc
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

import orjson
import pytest
from knowledge import paths
from knowledge.query.graph_view import master_graph
from knowledge.store.facts import KnowledgeStore
from knowledge.store.master import MasterCatalog
from knowledge.store.repository import CC, ID, MASTER, TBOX
from lineage_cases import prepared_store
from rdflib import Graph, Literal
from rdflib.namespace import DCTERMS, PROV, RDF, RDFS


# 동시 첫 조회와 RDF 삽입 순서 변경에도 JSON 바이트가 같아야 한다.
def test_concurrent_reads_and_reordered_triples() -> None:
    store = KnowledgeStore()
    with ThreadPoolExecutor(max_workers=4) as pool:
        views = list(pool.map(master_graph, [store.repository] * 8))
    expected = orjson.dumps(views[0])
    assert all(orjson.dumps(view) == expected for view in views)
    assert datetime.fromisoformat(views[0]["generatedAt"]).tzinfo is not None
    assert [node["id"] for node in views[0]["nodes"]] == sorted(node["id"] for node in views[0]["nodes"])
    for graph_id in (MASTER, TBOX):
        graph = store.repository.read_graph(graph_id)
        reordered = Graph()
        for triple in sorted(graph, key=lambda triple: tuple(map(str, triple)), reverse=True):
            reordered.add(triple)
        store.repository.replace_graph(graph_id, reordered)
    assert orjson.dumps(master_graph(store.repository)) == expected


# 생성 시각은 재시작 후에도 같고 모델 등록으로 버전이 바뀔 때만 새로 고정한다.
def test_restart_and_master_version_update(tmp_path: Path) -> None:
    store = KnowledgeStore(tmp_path / "knowledge")
    initial = master_graph(store.repository)
    del store
    gc.collect()
    reopened = KnowledgeStore(tmp_path / "knowledge")
    assert master_graph(reopened.repository) == initial
    card = orjson.loads((paths.CONTRACTS / "fixtures/model-card/valid-v0-1-0.json").read_bytes())
    reopened.master.register_model_run(card)
    changed = master_graph(reopened.repository)
    assert changed["masterVersion"] == initial["masterVersion"] + 1
    assert datetime.fromisoformat(changed["generatedAt"]) > datetime.fromisoformat(initial["generatedAt"])
    reopened.master.register_model_run(card)
    assert master_graph(reopened.repository) == changed


# TBox만 보완된 저장소도 버전을 한 번 올려 이전 지도 응답과 구분한다.
def test_tbox_sync_updates_master_version_once() -> None:
    store = KnowledgeStore()
    tbox = store.repository.read_graph(TBOX)
    tbox.remove((CC.PipelineStage, RDFS.label, None))
    store.repository.replace_graph(TBOX, tbox)
    before = master_graph(store.repository)
    MasterCatalog(store.repository)
    after = master_graph(store.repository)
    assert after["masterVersion"] == before["masterVersion"] + 1
    assert (
        next(node for node in after["nodes"] if node["id"] == "cc:PipelineStage")["label"]
        == "파이프라인 단계"
    )
    MasterCatalog(store.repository)
    assert master_graph(store.repository) == after


# 기준 라벨은 저장 제목보다 우선하고 클래스의 다국어 라벨은 한국어를 고른다.
def test_label_priority_and_stored_model_dataset_edge() -> None:
    store, _, card = prepared_store()
    graph = store.repository.read_graph(MASTER)
    graph.set((ID["ds-datalab-diy"], DCTERMS.title, Literal("옛 메뉴 이름")))
    graph.add((ID[card["id"]], PROV.used, ID["ds-datalab-diy"]))
    store.repository.replace_graph(MASTER, graph)
    tbox = store.repository.read_graph(TBOX)
    tbox.add((CC.Event, RDFS.label, Literal("Event", lang="en")))
    store.repository.replace_graph(TBOX, tbox)
    result = master_graph(store.repository)
    nodes = {node["id"]: node for node in result["nodes"]}
    assert nodes["cc:Event"]["label"] == "행사"
    assert nodes["ds-datalab-diy"]["label"] == "행사/축제 DIY 맞춤 분석"
    assert {
        "source": card["id"],
        "target": "ds-datalab-diy",
        "predicate": "prov:used",
        "label": "사용",
    } in result["edges"]


# 연결된 백테스트가 실패·미검증이면 모델 상태도 그대로 표시한다.
@pytest.mark.parametrize("result,label", [("failed", "실패"), ("unverified", "미검증"), ("passed", "통과")])
def test_model_validation_uses_linked_backtest(result: str, label: str) -> None:
    store, _, card = prepared_store()
    graph = store.repository.read_graph(MASTER)
    stage = ID["st-yeongjong-backtest"]
    graph.add((stage, RDF.type, CC.PipelineStage))
    graph.add((stage, CC.name, Literal("crowdcast/backtest")))
    graph.add((stage, CC.gateResult, Literal(result)))
    graph.add((ID[card["id"]], PROV.wasInformedBy, stage))
    store.repository.replace_graph(MASTER, graph)
    node = next(node for node in master_graph(store.repository)["nodes"] if node["id"] == card["id"])
    assert f"검증: {label}" in node["note"]
