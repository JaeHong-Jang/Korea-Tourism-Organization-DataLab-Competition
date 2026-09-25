"""실제 계보 적재의 멱등성·실패 보존·원자성과 SHACL 게이트를 검증한다."""

from hashlib import sha256

import orjson
import pytest
from knowledge.lineage.load import load_lineage, validate_lineage
from knowledge.lineage.mapping import file_id, stage_id
from knowledge.lineage.schema import LineageDocument
from knowledge.store.master import MasterCatalog
from knowledge.store.repository import CC, MASTER, TBOX
from knowledge.validate.engine import shacl_violations
from knowledge.validate.shapes import SHAPE_IDS
from lineage_cases import prepared_store
from rdflib import Literal
from rdflib.compare import isomorphic
from rdflib.namespace import PROV, RDF


# 사본 바이트가 같으면 버전·트리플이 그대로이고 바뀌면 과거 실패까지 보존한다.
def test_real_file_idempotence_and_history(caplog: pytest.LogCaptureFixture) -> None:
    store, path, _ = prepared_store()
    document = LineageDocument.model_validate_json(path.read_bytes())
    digest = sha256(path.read_bytes()).hexdigest()
    assert load_lineage(path, store.repository) == 3
    graph = store.repository.read_graph(MASTER)
    fetch = stage_id(digest, "crowdcast/fetch")
    assert (fetch, RDF.type, PROV.Activity) in graph
    assert graph.value(fetch, CC.gatePassed).toPython() is False
    assert str(graph.value(fetch, CC.gateMessage)) == document.assets[0].gate.message
    assert len(set(graph.subjects(RDF.type, CC.PipelineStage))) == 7
    assert load_lineage(path, store.repository) == 3
    assert isomorphic(graph, store.repository.read_graph(MASTER))
    validate_lineage(graph)
    assert shacl_violations(graph + store.repository.read_graph(TBOX), SHAPE_IDS) == []

    # 같은 실행의 새 모음도 과거 노드를 지우지 않고 새 버전으로 고정한다.
    changed = orjson.loads(path.read_bytes())
    changed["assets"][0]["gate"] = {"passed": True, "message": "연천 자료 게이트 재검사 통과"}
    changed["assets"][0]["status"] = "passed"
    path.write_bytes(orjson.dumps(changed))
    assert load_lineage(path, store.repository) == 4
    updated = store.repository.read_graph(MASTER)
    assert updated.value(fetch, CC.gatePassed).toPython() is False
    assert len(set(updated.subjects(RDF.type, CC.LineageSnapshot))) == 2
    assert load_lineage(path, store.repository) == 4
    MasterCatalog(store.repository)
    assert store.master.snapshot()[0] == 4
    assert "TTL에서 삭제" not in caplog.text


# 해시 없는 입력은 같은 경로의 실제 출력 해시를 빌려 생성 계보를 꾸미지 않는다.
def test_missing_hash_keeps_unknown_identity() -> None:
    store, path, _ = prepared_store()
    document = LineageDocument.model_validate_json(path.read_bytes())
    digest = sha256(path.read_bytes()).hexdigest()
    load_lineage(path, store.repository)
    graph = store.repository.read_graph(MASTER)
    asset = document.assets[0]
    stage = stage_id(digest, asset.key)
    input_file = next(file for file in asset.inputFiles if file.path.endswith("region_daily.parquet"))
    output_file = next(file for file in asset.outputFiles if file.path == input_file.path)
    incoming, outgoing = file_id(input_file, stage, "input"), file_id(output_file, stage, "output")
    assert incoming != outgoing
    assert graph.value(incoming, CC.sha256) is None
    assert graph.value(incoming, CC.note) == Literal("해시 없음")
    assert not list(graph.objects(incoming, PROV.wasGeneratedBy))
    assert graph.value(outgoing, CC.sha256) == Literal(output_file.sha256)
    assert (stage, PROV.used, incoming) in graph
    assert (outgoing, PROV.wasGeneratedBy, stage) in graph


# 실행 기록이 없는 자산도 게이트 결과를 갖되 false로 바꾸지 않는다.
def test_unrecorded_and_unverified_stages() -> None:
    store, path, _ = prepared_store()
    document = orjson.loads(path.read_bytes())
    document["assets"][0].update(gate=None, status=None, lastRunId=None)
    path.write_bytes(orjson.dumps(document))
    load_lineage(path, store.repository)
    graph = store.repository.read_graph(MASTER)
    digest = sha256(path.read_bytes()).hexdigest()
    for key in ("crowdcast/fetch", "crowdcast/batch", "crowdcast/publish"):
        stage = stage_id(digest, key)
        assert graph.value(stage, CC.gateResult) == Literal("unverified")
        assert graph.value(stage, CC.gatePassed) is None
    validate_lineage(graph)


# 잘못된 JSON·버전·의존성·경로·게이트는 어느 트리플도 반영하지 않는다.
@pytest.mark.parametrize("problem", ["json", "version", "dependency", "path", "hash", "gate", "order"])
def test_invalid_input_is_atomic(problem: str) -> None:
    store, path, _ = prepared_store()
    load_lineage(path, store.repository)
    before = store.repository.read_graph(MASTER)
    document = orjson.loads(path.read_bytes())
    asset = document["assets"][0]
    if problem == "version":
        document["schemaVersion"] = 2
    elif problem == "dependency":
        asset["deps"] = ["crowdcast/publish"]
    elif problem == "path":
        asset["inputFiles"][0]["path"] = "data/../../secret"
    elif problem == "hash":
        asset["inputFiles"][0]["sha256"] = "bad"
    elif problem == "gate":
        asset["gate"]["passed"] = "false"
    elif problem == "order":
        document["assets"].reverse()
    path.write_bytes(b"{" if problem == "json" else orjson.dumps(document))
    with pytest.raises(ValueError):
        load_lineage(path, store.repository)
    assert isomorphic(before, store.repository.read_graph(MASTER))


# 유효 그래프에서 게이트를 없애거나 모순된 결과를 넣으면 전용 SHACL이 거절한다.
@pytest.mark.parametrize("problem", ["missing-result", "missing-message", "contradiction"])
def test_gate_shacl_rejects_invalid_stage(problem: str) -> None:
    store, path, _ = prepared_store()
    load_lineage(path, store.repository)
    graph = store.repository.read_graph(MASTER)
    stage = next(graph.subjects(CC.gateResult, Literal("failed")))
    if problem == "missing-result":
        graph.remove((stage, CC.gateResult, None))
    elif problem == "missing-message":
        graph.remove((stage, CC.gateMessage, None))
    else:
        graph.set((stage, CC.gatePassed, Literal(True)))
    with pytest.raises(ValueError, match="SHACL"):
        validate_lineage(graph)
