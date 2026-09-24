"""이미 있는 저장소의 기준 그래프에 기준 TTL의 새 정의만 더하고 버전을 한 번 올리는지 검사한다."""

from knowledge.store.facts import KnowledgeStore
from knowledge.store.master import MasterCatalog
from knowledge.store.repository import CC, ID, MASTER


# 새 가정이 빠진 옛 저장소를 흉내 내 다시 열면 가정이 생기고, 한 번 더 열면 그대로다.
def test_existing_store_gets_new_definitions_once() -> None:
    store = KnowledgeStore()
    graph = store.repository.read_graph(MASTER)
    subject = ID["as-temporary-holiday-excluded"]
    assert (subject, None, None) in graph
    graph.remove((subject, None, None))
    store.repository.replace_graph(MASTER, graph)
    before = store.master.snapshot()[0]

    MasterCatalog(store.repository)
    version, sets = store.master.snapshot()
    assert "as-temporary-holiday-excluded" in sets["assumptions"] and version == before + 1

    # 기존 정의(다른 가정 값)는 건드리지 않고, 새 정의가 없으면 버전도 그대로다.
    title = store.repository.read_graph(MASTER).value(ID["as-peak-day-factor"], CC.value)
    MasterCatalog(store.repository)
    assert store.master.snapshot()[0] == version
    assert store.repository.read_graph(MASTER).value(ID["as-peak-day-factor"], CC.value) == title


# 일부 속성만 남은 정의는 빠진 속성을 채우고, 값이 다른 속성은 저장값을 두고 충돌로 알린다.
def test_partial_and_conflicting_definitions() -> None:
    from knowledge.store.master import sync_definitions
    from rdflib import BNode, Graph, Literal
    from rdflib.namespace import RDF

    fresh = Graph()
    subject = ID["as-demo"]
    fresh.add((subject, RDF.type, CC.Assumption))
    fresh.add((subject, CC.value, Literal(1.0)))
    first, second = BNode(), BNode()
    fresh.add((subject, CC.trainRange, first))
    fresh.add((first, CC.next, second))
    fresh.add((second, CC.next, first))  # 빈 노드 순환도 끝나야 한다
    stored = Graph()
    stored.add((subject, CC.value, Literal(2.0)))
    added, conflicts = sync_definitions(stored, fresh)
    assert (subject, RDF.type, CC.Assumption) in stored and added == 4
    assert conflicts == ["as-demo"] and stored.value(subject, CC.value) == Literal(2.0)
    assert sync_definitions(stored, fresh) == (0, ["as-demo"])


# 빈 노드 안의 값이 바뀌거나 TTL에서 술어·정의가 사라지면 저장값을 두고 충돌로 보고한다.
def test_blank_node_change_and_removals_are_reported() -> None:
    from knowledge.store.master import sync_definitions
    from rdflib import BNode, Graph, Literal
    from rdflib.namespace import RDF

    def graph(day: str, extra: bool) -> Graph:
        g, period = Graph(), BNode()
        g.add((ID["ds-demo"], RDF.type, CC.Dataset))
        g.add((ID["ds-demo"], CC.trainRange, period))
        g.add((period, CC.periodFrom, Literal(day)))
        if extra:
            g.add((ID["ds-demo"], CC.note, Literal("옛 설명")))
            g.add((ID["ds-gone"], RDF.type, CC.Dataset))
        return g

    stored = graph("2024-01-01", extra=True)
    added, conflicts = sync_definitions(stored, graph("2025-01-01", extra=False))
    assert added == 0 and sorted(conflicts) == ["ds-demo", "ds-gone(TTL에서 삭제)"]
    assert sync_definitions(graph("2024-01-01", extra=False), graph("2024-01-01", extra=False)) == (0, [])
