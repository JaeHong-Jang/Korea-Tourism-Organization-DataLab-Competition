"""문장 상태·위험 요소·OOD 여부에 따른 조건부 규칙의 적용 범위를 검증한다."""

import pytest
from contract_cases import RDFLIB_NQUADS_WARNING
from knowledge.store.repository import CC, ID
from knowledge.validate.engine import shacl_violations
from rdflib import Graph, Literal, Namespace
from rdflib.namespace import RDF
from shape_cases import CLAIM_ID, candidate_store, validation_graph

CITO = Namespace("http://purl.org/spar/cito/")
pytestmark = pytest.mark.filterwarnings(RDFLIB_NQUADS_WARNING)


# 조건별 그래프는 동일한 실제 계약 적재 스냅샷에서 복사한다.
@pytest.fixture(scope="module")
def normal_graph() -> Graph:
    return validation_graph(candidate_store(ood=True, numeric=True))


# 근거 요구는 후보와 발행에 적용하고 draft·rejected는 준비 중 상태로 허용한다.
@pytest.mark.parametrize("status", ["draft", "candidate", "published", "rejected"])
def test_claim_evidence_status(normal_graph: Graph, status: str) -> None:
    graph = Graph() + normal_graph
    graph.set((ID[CLAIM_ID], CC.status, Literal(status)))
    graph.remove((ID[CLAIM_ID], CITO.citesAsEvidence, None))
    assert bool(shacl_violations(graph, ("S01",))) == (status in {"candidate", "published"})


# 중복 상태가 있더라도 candidate 사실이 있으면 근거 검사를 생략할 수 없다.
def test_candidate_with_extra_status_still_needs_evidence(normal_graph: Graph) -> None:
    graph = Graph() + normal_graph
    graph.add((ID[CLAIM_ID], CC.status, Literal("draft")))
    graph.remove((ID[CLAIM_ID], CITO.citesAsEvidence, None))
    assert shacl_violations(graph, ("S01",))


# 여섯 법정 위험 요소와 일반 운영 위험 요소의 조건을 구별한다.
@pytest.mark.parametrize("hazard", ["폭죽", "불", "가연성가스", "석유류", "산", "수면", "차량진입"])
def test_legal_hazard_rule(normal_graph: Graph, hazard: str) -> None:
    graph = Graph() + normal_graph
    graph.set((ID["e-yeongjong-fireworks-2025"], CC.hazardLabel, Literal(hazard)))
    graph.remove((None, CC.judgedBy, ID["rule-legal-hazard"]))
    assert bool(shacl_violations(graph, ("S05",))) == (hazard != "차량진입")


# OOD 근거는 같은 예보를 대상으로 하는 불확실성·OOD 검사여야 한다.
@pytest.mark.parametrize("problem", ["other-forecast", "wrong-kind", "failed-check"])
def test_ood_evidence_must_match_forecast(normal_graph: Graph, problem: str) -> None:
    graph = Graph() + normal_graph
    evidence = ID["ev-yeongjong-ood"]
    check = graph.value(evidence, CC.checkResult)
    if problem == "other-forecast":
        graph.set((evidence, CC.aboutForecast, ID["f-seoul-2025"]))
    elif problem == "wrong-kind":
        graph.set((check, CC.checkKind, Literal("number")))
    else:
        graph.set((check, CC.passed, Literal(False)))
    assert shacl_violations(graph, ("S10",))


# OOD 권고도 참고용 근거가 필요하지만 설명 문장에는 같은 제약을 강제하지 않는다.
@pytest.mark.parametrize("claim_type", ["판정", "권고", "설명"])
def test_ood_claim_types(normal_graph: Graph, claim_type: str) -> None:
    graph = Graph() + normal_graph
    graph.set((ID[CLAIM_ID], CC.claimType, Literal(claim_type)))
    graph.remove((ID[CLAIM_ID], CITO.citesAsEvidence, ID["ev-yeongjong-ood"]))
    assert bool(shacl_violations(graph, ("S10",))) == (claim_type in {"판정", "권고"})


# 발행 뒤 새 내용 revision이 생겨도 이미 발행된 문장을 후보로 다시 검사하지 않는다.
@pytest.mark.parametrize("status", ["draft", "candidate", "published", "rejected"])
def test_s12_checks_candidates_only(normal_graph: Graph, status: str) -> None:
    graph = Graph() + normal_graph
    graph.set((ID[CLAIM_ID], CC.status, Literal(status)))
    graph.remove((ID[CLAIM_ID], CC.checkedBy, None))
    assert bool(shacl_violations(graph, ("S12",))) == (status == "candidate")


# 정상 관측값이 하나 있어도 실행이 참조하는 두 번째 누수 관측값을 놓치지 않는다.
def test_s09_checks_every_used_observation(normal_graph: Graph) -> None:
    graph = Graph() + normal_graph
    other = ID["obs-yeongjong-future"]
    for _, predicate, value in list(graph.triples((ID["obs-28110-sat-nonlocal"], None, None))):
        graph.add((other, predicate, value))
    graph.set((other, CC.aboutRegion, ID["11110"]))
    graph.add((ID["pr-f-yeongjong-2025"], Namespace("http://www.w3.org/ns/prov#").used, other))
    assert shacl_violations(graph, ("S09",))


# 모델 버전이 없는 두 번째 모델도 모델 개수 검사에서 제외되면 안 된다.
def test_s08_counts_invalid_second_model(normal_graph: Graph) -> None:
    graph = Graph() + normal_graph
    model = ID["mr-v0-2-0"]
    graph.add((model, RDF.type, CC.ModelRun))
    graph.add((ID["pr-f-yeongjong-2025"], Namespace("http://www.w3.org/ns/prov#").used, model))
    assert shacl_violations(graph, ("S08",))
