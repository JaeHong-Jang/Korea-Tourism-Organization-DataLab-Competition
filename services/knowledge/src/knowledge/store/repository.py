"""Oxigraph named graph를 읽고 트랜잭션으로 교체한다."""

from pathlib import Path
from threading import RLock

from pyoxigraph import NamedNode, RdfFormat, Store
from rdflib import Graph, Namespace, URIRef

CC = Namespace("http://crowdcast.local/ont#")
ID = Namespace("http://crowdcast.local/id/")
MASTER = ID.master
TBOX = ID.ontology


# 같은 저장소의 세션 쓰기는 세션 잠금, 기준 그래프 쓰기는 기준 잠금으로 묶는다.
class GraphRepository:
    # 테스트는 경로 없이 만들고 서비스는 knowledge.paths.STORE를 전달한다.
    def __init__(self, path: Path | None = None) -> None:
        if path is not None:
            path.mkdir(parents=True, exist_ok=True)
        self.store = Store(path)
        self.master_lock = RLock()
        self._locks_lock = RLock()
        self._session_locks: dict[str, RLock] = {}

    # 잠금 객체 생성도 보호해 같은 세션에 잠금이 두 개 생기지 않게 한다.
    def session_lock(self, session_id: str) -> RLock:
        with self._locks_lock:
            return self._session_locks.setdefault(session_id, RLock())

    # 지정된 그래프만 꺼내 다른 세션의 사실이 검증 범위에 섞이지 않게 한다.
    def read_graph(self, graph_id: URIRef) -> Graph:
        data = self.store.dump(format=RdfFormat.N_TRIPLES, from_graph=NamedNode(str(graph_id)))
        return Graph(identifier=graph_id).parse(data=data, format="nt")

    # revision과 사실·문장 상태를 하나의 Oxigraph 트랜잭션으로 바꾼다.
    def replace_graph(self, graph_id: URIRef, graph: Graph) -> None:
        iri = NamedNode(str(graph_id))
        triples = graph.serialize(format="nt")
        self.store.update(f"CLEAR SILENT GRAPH {iri}; INSERT DATA {{ GRAPH {iri} {{\n{triples}\n}} }}")
