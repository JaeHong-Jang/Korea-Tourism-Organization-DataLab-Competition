"""전체 지도에 쓰는 두 그래프와 버전별 최초 생성 시각을 함께 고정한다."""

from datetime import UTC, datetime

from knowledge.store.repository import CC, ID, MASTER, TBOX, GraphRepository
from rdflib import Graph, Literal
from rdflib.namespace import XSD

VIEW = ID["master-graph-view"]


# 생성 시각은 별도 메타데이터 그래프에 보존해 조회·재시작이 같은 응답을 만든다.
def graph_view_snapshot(repository: GraphRepository) -> tuple[Graph, Graph, str]:
    with repository.master_lock:
        master = repository.read_graph(MASTER)
        tbox = repository.read_graph(TBOX)
        metadata = repository.read_graph(VIEW)
        version = master.value(MASTER, CC.masterVersion)
        generated_at = metadata.value(VIEW, CC.createdAt)
        if metadata.value(VIEW, CC.masterVersion) != version or generated_at is None:
            generated_at = Literal(datetime.now(UTC).isoformat(), datatype=XSD.dateTime)
            metadata = Graph()
            metadata.add((VIEW, CC.masterVersion, version))
            metadata.add((VIEW, CC.createdAt, generated_at))
            repository.replace_graph(VIEW, metadata)
        return master, tbox, str(generated_at)
