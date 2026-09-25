"""TBox와 기준 그래프만 결정적 순서의 전체 근거 지도 JSON으로 만든다."""

import orjson
from knowledge.paths import JSONLD
from knowledge.query.graph_files import compact_files
from knowledge.query.graph_labels import PROV_CLASSES, curie, literal_text, node_id, relation_label
from knowledge.query.graph_nodes import class_node, instance_kind, instance_node
from knowledge.store.graph_view import graph_view_snapshot
from knowledge.store.repository import CC, MASTER, GraphRepository
from rdflib import URIRef
from rdflib.namespace import OWL, RDF, RDFS


# 읽기 범위를 저장소에서 고정하고 원문 JSON·빈 노드·세션 개체를 표시 대상에서 제외한다.
def master_graph(repository: GraphRepository) -> dict:
    master, tbox, generated_at = graph_view_snapshot(repository)
    labels = orjson.loads((JSONLD / "master-labels.json").read_bytes())
    classes = {
        subject
        for subject in tbox.subjects(RDF.type, OWL.Class)
        if isinstance(subject, URIRef) and str(subject).startswith(str(CC))
    }
    classes.update(
        cls
        for cls in PROV_CLASSES
        if any(tbox.triples((None, None, cls))) or any(master.triples((None, RDF.type, cls)))
    )
    subjects = {subject for subject in master.subjects() if isinstance(subject, URIRef) and subject != MASTER}
    nodes = {node_id(cls): class_node(tbox, cls) for cls in sorted(classes)}
    paths = {}
    for subject in sorted(subjects):
        kind = instance_kind(master, subject)
        if kind is not None:
            identifier = node_id(subject)
            nodes[identifier] = instance_node(master, subject, kind, labels)
            if kind == "file":
                paths[identifier] = literal_text(master, subject, CC.filePath)

    # 간선 방향은 원본 RDF를 유지하고 종류와 클래스 사이의 선언을 더한다.
    triples = {
        (source, predicate, target)
        for source, predicate, target in master
        if isinstance(source, URIRef)
        and isinstance(target, URIRef)
        and source in subjects
        and (target in subjects or target in classes)
        and node_id(source) in nodes
        and node_id(target) in nodes
    }
    triples.update(
        (source, RDFS.subClassOf, target)
        for source, target in tbox.subject_objects(RDFS.subClassOf)
        if source in classes and target in classes
    )
    triples.update(
        (source, predicate, target)
        for predicate, source in tbox.subject_objects(RDFS.domain)
        for target in tbox.objects(predicate, RDFS.range)
        if source in classes and target in classes
    )

    # 파일 묶음 뒤에도 끊긴 간선과 중복 간선 없이 같은 키 순서를 유지한다.
    nodes, replacements = compact_files(nodes, paths)
    edges = {
        (
            replacements.get(node_id(source), node_id(source)),
            replacements.get(node_id(target), node_id(target)),
            curie(predicate),
            relation_label(tbox, predicate),
        )
        for source, predicate, target in triples
    }
    return {
        "masterVersion": int(master.value(MASTER, CC.masterVersion)),
        "generatedAt": generated_at,
        "nodes": [nodes[identifier] for identifier in sorted(nodes)],
        "edges": [
            dict(zip(("source", "target", "predicate", "label"), edge, strict=True)) for edge in sorted(edges)
        ],
    }
