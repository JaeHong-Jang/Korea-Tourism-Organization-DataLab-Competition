"""세션·기준 그래프 잠금 안에서 검증할 revision과 masterVersion을 고정한다."""

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass

from knowledge.store.facts import KnowledgeStore, violations_for
from knowledge.store.repository import CC, ID, MASTER, TBOX
from knowledge.store.session_graph import read_documents
from rdflib import Graph


# API가 범위 변경을 일반 검증 실패와 구별해 409로 응답하게 한다.
class ScopeConflict(ValueError):
    # 요청 범위 대신 현재 범위를 보고해 호출자가 다시 검증할 수 있게 한다.
    def __init__(self, report: dict) -> None:
        self.report = report
        super().__init__("revision 또는 masterVersion이 현재 범위와 다르다")


# 원문과 합집합 그래프를 같은 잠금 범위에서 읽은 검증 입력으로 묶는다.
@dataclass(frozen=True)
class Snapshot:
    revision: int
    master_version: int
    records: list[dict]
    graph: Graph

    # 모든 성공·실패 응답에 실제 검사한 범위를 기록한다.
    def report(self, gate: str, violations: list[dict]) -> dict:
        return {
            "gate": gate,
            "passed": not violations,
            "revision": self.revision,
            "masterVersion": self.master_version,
            "violations": violations,
        }


# 적재와 같은 잠금 순서를 쓰고 검증·발행이 끝날 때까지 두 잠금을 유지한다.
@contextmanager
def locked_snapshot(
    store: KnowledgeStore, session_id: str, revision: int, master_version: int, gate: str
) -> Iterator[Snapshot]:
    store.scope(session_id)
    repository = store.repository
    with repository.session_lock(session_id), repository.master_lock:
        graph = repository.read_graph(ID[session_id])
        records, scope = read_documents(graph, session_id)
        master = repository.read_graph(MASTER)
        version = int(master.value(MASTER, CC.masterVersion))
        snapshot = Snapshot(scope["revision"], version, records, graph)
        if (revision, master_version) != (snapshot.revision, version):
            violations = violations_for(session_id, ["revision 또는 masterVersion이 현재 범위와 다르다"])
            raise ScopeConflict(snapshot.report(gate, violations))

        # named graph 세 개만 합쳐 다른 세션의 사실이 참조를 보충하지 못하게 한다.
        graph += master
        graph += repository.read_graph(TBOX)
        yield snapshot
