"""규칙별 정상·위반 그래프와 날짜·검사 종류의 경계 조건을 검증한다."""

from pathlib import Path

import pytest
from contract_cases import RDFLIB_NQUADS_WARNING
from knowledge.paths import ONTOLOGY
from knowledge.validate.engine import shacl_violations
from knowledge.validate.shapes import SHAPE_IDS
from rdflib import Graph
from rdflib.namespace import SH, XSD
from shape_cases import candidate_store, validation_graph

FIXTURES = Path(__file__).parent / "fixtures/shapes"
PREFIXES = """
PREFIX cc: <http://crowdcast.local/ont#>
PREFIX id: <http://crowdcast.local/id/>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX cito: <http://purl.org/spar/cito/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
"""
pytestmark = pytest.mark.filterwarnings(RDFLIB_NQUADS_WARNING)


# 공유 정상 그래프는 읽기만 하고 위반 테스트마다 별도 사본을 만든다.
@pytest.fixture(scope="module")
def normal_graph() -> Graph:
    return validation_graph(candidate_store(numeric=True, ood=True))


# 규칙마다 조건부 경로까지 활성화된 정상 계약 적재 그래프가 통과해야 한다.
@pytest.mark.parametrize("shape_id", SHAPE_IDS)
def test_each_shape_accepts_contract_graph(normal_graph: Graph, shape_id: str) -> None:
    assert shacl_violations(normal_graph, (shape_id,)) == []


# 지정된 계약 세 문서와 조건부 요구를 확장한 정상 그래프 모두 전체 규칙을 통과한다.
def test_original_contract_fixtures_pass_all_shapes(normal_graph: Graph) -> None:
    assert shacl_violations(validation_graph(candidate_store()), SHAPE_IDS) == []
    assert shacl_violations(normal_graph, SHAPE_IDS) == []


# 단독 검사와 전체 검사 모두 기대한 규칙만 실패해야 다른 위반을 숨길 수 없다.
@pytest.mark.parametrize("path", sorted(FIXTURES.glob("*.rq")), ids=lambda path: path.stem)
def test_violation_fixture(normal_graph: Graph, path: Path) -> None:
    graph = Graph() + normal_graph
    graph.update(path.read_text())
    shape_id = path.name[:3].upper()
    violations = shacl_violations(graph, (shape_id,))
    assert violations, path.name
    assert {violation["shapeId"] for violation in violations} == {shape_id}

    # 날짜 형식과 관측값 누락은 각각 두 규칙이 같은 구조를 요구하므로 함께 실패한다.
    expected = {
        "s09-invalid-date": {"S03", "S09"},
        "s09-missing-observation": {"S08", "S09"},
    }.get(path.stem, {shape_id})
    violations = shacl_violations(graph, SHAPE_IDS)
    assert {violation["shapeId"] for violation in violations} == expected, violations


# 조건부 요구와 모든 검사에 대한 판정이 각각 빠짐없이 적용돼야 한다.
@pytest.mark.parametrize(
    ("shape_id", "update"),
    [
        ("S02", "DELETE WHERE { ?placeholder cc:name ?name ; cc:quantity ?quantity . }"),
        ("S02", "DELETE WHERE { ?placeholder cc:field ?field . }"),
        ("S02", "INSERT DATA { id:q-f-yeongjong-2025-peak cc:p50 21000 . }"),
        ("S03", "DELETE WHERE { id:obs-28110-sat-nonlocal cc:availableAt ?date . }"),
        ("S06", "DELETE WHERE { id:ev-rule-legal-hazard cc:aboutRule ?rule . }"),
        ("S08", "DELETE WHERE { id:mr-v0-1-0 cc:modelVersion ?version . }"),
        ("S08", "DELETE WHERE { id:mr-v0-1-0 cc:trainRange ?range . }"),
        ("S09", "DELETE WHERE { id:pr-f-yeongjong-2025 prov:used id:obs-28110-sat-nonlocal . }"),
        ("S09", "DELETE WHERE { id:obs-28110-sat-nonlocal cc:availableAt ?date . }"),
        ("S09", "DELETE WHERE { id:f-yeongjong-2025 cc:asOf ?date . }"),
        ("S09", "DELETE WHERE { id:obs-28110-sat-nonlocal cc:aboutRegion ?region . }"),
        ("S12", "DELETE WHERE { ?claim cc:checkedBy ?check . ?check cc:checkKind 'evidence' . }"),
        ("S12", "DELETE WHERE { ?claim cc:checkedBy ?check . ?check cc:checkKind 'number' . }"),
        ("S12", "DELETE WHERE { ?claim cc:checkedBy ?check . ?check cc:checkKind 'rule' . }"),
        ("S12", "DELETE WHERE { ?claim cc:checkedBy ?check . ?check cc:checkKind 'uncertainty' . }"),
        ("S12", "DELETE WHERE { ?check cc:checksRevision ?revision . }"),
        ("S12", "DELETE WHERE { id:s-demo-0001 cc:revision ?revision . }"),
        ("S12", "DELETE WHERE { ?claim cc:inSession ?session . }"),
        ("S12", "INSERT { ?check cc:passed false } WHERE { ?claim cc:checkedBy ?check }"),
        ("S12", "INSERT { ?check cc:checksRevision 99 } WHERE { ?claim cc:checkedBy ?check }"),
    ],
)
def test_missing_or_conflicting_structure(normal_graph: Graph, shape_id: str, update: str) -> None:
    graph = Graph() + normal_graph
    graph.update(PREFIXES + update)
    assert shacl_violations(graph, (shape_id,))


# 날짜 경계는 포함하고 추가 지역·날짜가 하나라도 잘못되면 거부한다.
@pytest.mark.parametrize("date,passed", [("2025-10-04", True), ("2025-10-05", False)])
def test_observation_cutoff_is_inclusive(normal_graph: Graph, date: str, passed: bool) -> None:
    graph = Graph() + normal_graph
    graph.update(
        PREFIXES
        + f"""
        DELETE {{ id:obs-28110-sat-nonlocal cc:availableAt ?old }}
        INSERT {{ id:obs-28110-sat-nonlocal cc:availableAt '{date}'^^xsd:date }}
        WHERE {{ id:obs-28110-sat-nonlocal cc:availableAt ?old }}
    """
    )
    assert (not shacl_violations(graph, ("S09",))) == passed


# SHACL 숫자 타입에 decimal이 섞이지 않고 값과 revision이 계약 타입을 따른다.
def test_shape_numeric_datatypes() -> None:
    graph = Graph()
    for path in (ONTOLOGY / "shapes").glob("*.ttl"):
        graph.parse(path)
    datatypes = set(graph.objects(None, SH.datatype))
    assert XSD.double in datatypes and XSD.integer in datatypes
    assert XSD.decimal not in datatypes
