"""발행 문장에서 도달하는 공개 RDF만 계약 JSON-LD로 압축한다."""

from knowledge.convert.jsonld import BASE, contract_context, reject_remote_document
from knowledge.query.runner import QueryScope
from knowledge.store.repository import CC, ID, MASTER
from pyld import jsonld
from rdflib import BNode, Graph, Literal, Namespace, URIRef
from rdflib.namespace import RDF

CITO = Namespace("http://purl.org/spar/cito/")
EVIDENCE_TYPES = {
    CC.Evidence,
    CC.DataEvidence,
    CC.ModelEvidence,
    CC.RuleEvidence,
    CC.CaseEvidence,
    CC.AssumptionEvidence,
    CC.CheckEvidence,
}
INTERNAL_PREDICATES = {CC.loadedDocument, CC.documentOrder, CC.documentSchema, CC.sourceDocument}


# 비발행 문장·미인용 근거와 내부 원문으로 가는 모든 연결을 제거한다.
def published_graph(scope: QueryScope) -> Graph:
    repository = scope.repository
    with repository.session_lock(scope.session_id), repository.master_lock:
        session = repository.read_graph(ID[scope.session_id])
        claims = set(session.subjects(RDF.type, CC.Claim))
        published = {claim for claim in claims if (claim, CC.status, Literal("published")) in session}
        cited = {evidence for claim in published for evidence in session.objects(claim, CITO.citesAsEvidence)}
        evidence_nodes = {node for kind in EVIDENCE_TYPES for node in session.subjects(RDF.type, kind)}
        hidden = (claims - published) | (evidence_nodes - cited)
        # 같은 속성의 기준값이 세션의 실제 적용값과 함께 표시되지 않게 한다.
        source = Graph()
        source += session
        for subject, predicate, obj in repository.read_graph(MASTER):
            if (subject, predicate, None) not in session:
                source.add((subject, predicate, obj))

    # 관련 수치·관측값·출처·규칙을 따라가되 내부 원문과 숨긴 노드는 다시 열지 않는다.
    result = Graph()
    pending = list(published)
    visited = set()
    while pending:
        subject = pending.pop()
        if subject in visited or subject in hidden:
            continue
        visited.add(subject)
        for predicate, obj in source.predicate_objects(subject):
            if predicate in INTERNAL_PREDICATES or obj in hidden:
                continue
            result.add((subject, predicate, obj))
            if isinstance(obj, (BNode, URIRef)):
                pending.append(obj)
    return result


# 외부 문서 로더를 막고 계약 정본 컨텍스트를 그대로 응답에 넣는다.
def session_graph(scope: QueryScope) -> dict:
    graph = published_graph(scope)
    context, _ = contract_context()
    expanded = jsonld.from_rdf(graph.serialize(format="nt"), {"format": "application/n-quads"})
    return jsonld.compact(
        expanded,
        context,
        {"base": BASE, "documentLoader": reject_remote_document, "compactArrays": False},
    )
