"""JSON-LD 계약의 기대 트리플과 Oxigraph 숫자 왕복을 검증한다."""

import re
import runpy
from collections import Counter
from pathlib import Path

import pytest
from contract_cases import RDFLIB_NQUADS_WARNING, read_json
from knowledge.convert import json_to_graph
from knowledge.paths import CONTRACTS, JSONLD, ONTOLOGY, REPO_ROOT
from knowledge.store.repository import CC, ID, MASTER, GraphRepository
from rdflib import Graph, Literal, URIRef
from rdflib.compare import isomorphic
from rdflib.namespace import RDF, XSD

EXPECTATIONS = sorted((JSONLD / "expected").glob("*.json"))
TERM = runpy.run_path(str(CONTRACTS / "check/jsonld_check.py"))["term"]


# 모든 계약 기대값과 금지값을 비교하고 형식 오류 리터럴을 거부한다.
@pytest.mark.filterwarnings(RDFLIB_NQUADS_WARNING)
@pytest.mark.parametrize("path", EXPECTATIONS, ids=lambda path: path.stem)
def test_contract_triples_and_numeric_roundtrip(path: Path) -> None:
    expected = read_json(path)
    doc = read_json(CONTRACTS / expected["fixture"])
    original = read_json(CONTRACTS / expected["fixture"])
    graph = json_to_graph(doc, expected["schema"])
    assert doc == original
    for triple in expected["triples"]:
        assert any(graph.triples(tuple(TERM(term) for term in triple))), triple
    for triple in expected.get("absent", []):
        assert not any(graph.triples(tuple(TERM(term) for term in triple))), triple
    assert not [obj for obj in graph.objects() if isinstance(obj, Literal) and obj.ill_typed]

    # 실제 Oxigraph 직렬화 이후에도 리터럴의 타입과 값이 같아야 한다.
    repository = GraphRepository()
    repository.replace_graph(ID["s-numeric-roundtrip"], graph)
    restored = repository.read_graph(ID["s-numeric-roundtrip"])
    assert isomorphic(graph, restored)
    numeric = Counter(
        (pred, obj)
        for _, pred, obj in graph
        if isinstance(obj, Literal) and obj.datatype in {XSD.double, XSD.integer}
    )
    actual = Counter(
        (pred, obj)
        for _, pred, obj in restored
        if isinstance(obj, Literal) and obj.datatype in {XSD.double, XSD.integer}
    )
    assert numeric
    assert actual == numeric


# TTL 전부를 파싱하고 기준 id마다 요구된 클래스를 확인한다.
def test_ontology_and_master_ids() -> None:
    graph = Graph()
    for path in sorted(ONTOLOGY.rglob("*.ttl")):
        assert path.read_text().startswith("# ")
        graph.parse(path, format="turtle")
    kinds = {
        "datasets": CC.Dataset,
        "clauses": CC.LegalClause,
        "assumptions": CC.Assumption,
        "agents": CC.TeamAgent,
    }
    master_ids = read_json(JSONLD / "master-ids.json")
    for kind, cls in kinds.items():
        for node_id in master_ids[kind]:
            assert (ID[node_id], RDF.type, cls) in graph
    for node_id in master_ids["rules"]:
        cls = CC.LegalRule if node_id.startswith("rule-legal-") else CC.InternalRule
        assert (ID[node_id], RDF.type, cls) in graph
        if cls == CC.LegalRule:
            assert (ID[node_id], CC.basedOnClause, ID["law-disaster-act-enf-73-9"]) in graph
    assert int(graph.value(MASTER, CC.masterVersion)) >= 1
    assert not [obj for obj in graph.objects() if isinstance(obj, Literal) and obj.ill_typed]


# 기준 가정마다 유효한 숫자 값과 상·하한이 하나씩 있고 값이 범위 안에 있어야 한다.
@pytest.mark.parametrize("node_id", read_json(JSONLD / "master-ids.json")["assumptions"])
def test_master_assumption_value_is_within_range(node_id: str) -> None:
    graph = Graph().parse(ONTOLOGY / "master/assumptions.ttl", format="turtle")
    values = {}
    for field in ("value", "rangeLow", "rangeHigh"):
        terms = list(graph.objects(ID[node_id], CC[field]))
        assert len(terms) == 1, (node_id, field)
        term = terms[0]
        assert isinstance(term, Literal) and term.datatype == XSD.double and not term.ill_typed
        values[field] = float(term)
    assert values["rangeLow"] <= values["value"] <= values["rangeHigh"]


# 계획의 정상 Turtle 예시를 그대로 읽어 named graph에 적재한다.
def test_plan_example_loads() -> None:
    plan = (REPO_ROOT / "docs/plan/09_온톨로지_근거그래프.md").read_text()
    example = re.search(r"```turtle\n(.*?)```", plan, re.S).group(1)
    graph = Graph().parse(data=example, format="turtle")
    repository = GraphRepository()
    repository.replace_graph(ID["s-demo-0001"], graph)
    restored = repository.read_graph(ID["s-demo-0001"])
    assert isomorphic(graph, restored)
    assert (ID["agent-explainer"], RDF.type, CC.TeamAgent) in restored
    assert (ID["c-yeongjong-3"], CC.status, Literal("candidate")) in restored


# JSON-LD의 클래스와 속성 모두 온톨로지에 선언돼 있어야 한다.
def test_context_vocabulary_is_declared() -> None:
    graph = Graph().parse(ONTOLOGY / "crowdcast.ttl")
    context = (JSONLD / "context.jsonld").read_text()
    names = set(re.findall(r'"cc:([A-Za-z]+)"', context))
    assert not [name for name in names if not any(graph.triples((URIRef(CC[name]), RDF.type, None)))]
