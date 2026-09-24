"""발행 인용 관계를 확인한 세션에서 근거 계약 원문을 복원한다."""

from copy import deepcopy

from knowledge.query.runner import QueryScope, run
from knowledge.store.repository import ID, GraphRepository
from knowledge.store.session_graph import read_documents
from pyoxigraph import NamedNode
from rdflib.namespace import RDF


# 없는 자원과 아직 발행되지 않은 자원은 같은 404로 다룬다.
class UnpublishedResource(LookupError):
    pass


# 세션 인자가 없는 계약 URL은 유일한 소유 세션만 선택하고 충돌 시 닫는다.
def resource_scope(repository: GraphRepository, resource_id: str) -> QueryScope:
    try:
        subject = NamedNode(str(ID[resource_id]))
    except ValueError as error:
        raise UnpublishedResource(resource_id) from error
    graphs = {
        quad.graph_name.value.removeprefix(str(ID))
        for quad in repository.store.quads_for_pattern(subject, NamedNode(str(RDF.type)), None, None)
        if isinstance(quad.graph_name, NamedNode) and quad.graph_name.value.startswith(str(ID) + "s-")
    }
    if len(graphs) != 1:
        raise UnpublishedResource(resource_id)
    return QueryScope(repository, graphs.pop())


# 인용 확인과 원문 복원을 같은 잠금 안에서 수행해 상태가 섞이지 않게 한다.
def claim_evidence(repository: GraphRepository, claim_id: str) -> list[dict]:
    scope = resource_scope(repository, claim_id)
    with repository.session_lock(scope.session_id), repository.master_lock:
        rows = run("claim_evidence", {"claim": claim_id}, scope)
        if not rows:
            raise UnpublishedResource(claim_id)
        _, documents = read_documents(repository.read_graph(ID[scope.session_id]), scope.session_id)
        cited = {row["evidence"] for row in rows}
        return [
            deepcopy(documents["evidence"][evidence_id])
            for evidence_id in documents["claims"][claim_id]["evidenceIds"]
            if evidence_id in cited
        ]


# 근거 단독 조회도 같은 세션의 발행 문장이 직접 인용했을 때만 허용한다.
def evidence(repository: GraphRepository, evidence_id: str) -> dict:
    scope = resource_scope(repository, evidence_id)
    with repository.session_lock(scope.session_id), repository.master_lock:
        if not run("claim_evidence", {"evidence": evidence_id}, scope):
            raise UnpublishedResource(evidence_id)
        _, documents = read_documents(repository.read_graph(ID[scope.session_id]), scope.session_id)
        return deepcopy(documents["evidence"][evidence_id])
