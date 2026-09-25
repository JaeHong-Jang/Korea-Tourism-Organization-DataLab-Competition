"""계보 스냅샷의 단계와 입출력 파일을 실행별 PROV 그래프로 변환한다."""

from hashlib import sha256

from knowledge.lineage.datasets import dataset_for_path
from knowledge.lineage.schema import Asset, LineageDocument, LineageFile
from knowledge.store.repository import CC, ID
from rdflib import Graph, Literal, URIRef
from rdflib.namespace import PROV, RDF, XSD


# 스냅샷마다 단계 식별자를 분리해 새 실패가 과거 실행을 덮어쓰지 않는다.
def stage_id(digest: str, key: str) -> URIRef:
    return ID[f"st-pipeline-{digest}-{key.rsplit('/', 1)[-1]}"]


# 경로와 해시가 같을 때만 파일을 합치고 무해시 파일은 단계·입출력별로 분리한다.
def file_id(file: LineageFile, stage: URIRef, direction: str) -> URIRef:
    identity = f"{file.path}\0{file.sha256}" if file.sha256 else f"{stage}\0{direction}\0{file.path}"
    return ID[f"file-{sha256(identity.encode()).hexdigest()}"]


# 원문 경로·해시를 기록하고 알려진 데이터 출처에만 파생 관계를 추가한다.
def add_file(graph: Graph, file: LineageFile, stage: URIRef, direction: str) -> URIRef:
    subject = file_id(file, stage, direction)
    graph.add((subject, RDF.type, PROV.Entity))
    graph.add((subject, CC.filePath, Literal(file.path)))
    if file.sha256:
        graph.add((subject, CC.sha256, Literal(file.sha256)))
    else:
        graph.add((subject, CC.note, Literal("해시 없음")))
    dataset = dataset_for_path(file.path)
    if dataset is not None:
        graph.add((subject, PROV.wasDerivedFrom, dataset))
    if direction == "input":
        graph.add((stage, PROV.used, subject))
    else:
        graph.add((subject, PROV.wasGeneratedBy, stage))
    return subject


# null 게이트를 미검증으로 표시하며 false를 누락하거나 성공으로 바꾸지 않는다.
def add_stage(graph: Graph, asset: Asset, digest: str, order: int) -> None:
    subject = stage_id(digest, asset.key)
    graph.add((subject, RDF.type, CC.PipelineStage))
    graph.add((subject, RDF.type, PROV.Activity))
    graph.add((subject, CC.name, Literal(asset.key)))
    graph.add((subject, CC.stageOrder, Literal(order, datatype=XSD.integer)))
    graph.add((subject, CC.stageStatus, Literal(asset.status or "unrecorded")))
    passed = asset.gate.passed if asset.gate else None
    result = "unverified" if passed is None else "passed" if passed else "failed"
    graph.add((subject, CC.gateResult, Literal(result)))
    graph.add((subject, CC.gateMessage, Literal(asset.gate.message if asset.gate else "실행 기록 없음")))
    if passed is not None:
        graph.add((subject, CC.gatePassed, Literal(passed)))
    for predicate, value in ((CC.lastRunId, asset.lastRunId), (CC.dagsterRunId, asset.dagsterRunId)):
        if value is not None:
            graph.add((subject, predicate, Literal(value)))
    for dependency in asset.deps:
        graph.add((subject, PROV.wasInformedBy, stage_id(digest, dependency)))
    for file in asset.inputFiles:
        add_file(graph, file, subject, "input")
    for file in asset.outputFiles:
        add_file(graph, file, subject, "output")


# 스냅샷 해시와 내보낸 시각을 함께 남겨 서로 다른 실행들의 최신 모음임을 드러낸다.
def lineage_graph(document: LineageDocument, digest: str) -> Graph:
    graph = Graph()
    snapshot = ID[f"lineage-{digest}"]
    graph.add((snapshot, RDF.type, CC.LineageSnapshot))
    graph.add((snapshot, CC.sha256, Literal(digest)))
    graph.add((snapshot, CC.exportedAt, Literal(document.exportedAt.isoformat(), datatype=XSD.dateTime)))
    for order, asset in enumerate(document.assets, start=1):
        graph.add((snapshot, CC.hasStage, stage_id(digest, asset.key)))
        add_stage(graph, asset, digest, order)
    return graph
