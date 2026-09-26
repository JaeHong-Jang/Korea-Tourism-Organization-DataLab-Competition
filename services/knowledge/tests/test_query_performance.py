"""300트리플 세션에서 화면용 질의 다섯 개의 중앙값을 측정한다."""

from statistics import median
from time import perf_counter

import pytest
from contract_cases import RDFLIB_NQUADS_WARNING, SESSION_ID
from fastapi.testclient import TestClient
from knowledge.api.app import create_app
from knowledge.query.runner import QUERY_BINDINGS, QueryScope, run
from knowledge.store.repository import CC, ID, MASTER
from query_cases import publish_session
from rdflib import Literal
from shape_cases import candidate_store


# 파일 읽기·잠금·Oxigraph 실행·dict 변환을 포함하고 예열 뒤 21회 중앙값을 출력한다.
@pytest.mark.filterwarnings(RDFLIB_NQUADS_WARNING)
def test_queries_300_triples() -> None:
    store = candidate_store(numeric=True, ood=True)
    with TestClient(create_app(store)) as client:
        publish_session(client, store)
    graph = store.repository.read_graph(ID[SESSION_ID])
    source_size = len(graph)
    assert source_size <= 300
    for index in range(300 - source_size):
        graph.add((ID[SESSION_ID], CC.note, Literal(f"영종 불꽃축제 질의 측정 메모 {index}")))
    assert len(graph) == 300
    store.repository.replace_graph(ID[SESSION_ID], graph)

    # 환경별 속도 차이에 대한 임의 문턱 없이 실제 측정 조건과 결과를 남긴다.
    scope = QueryScope(store.repository, SESSION_ID)
    master_size = len(store.repository.read_graph(MASTER))
    print(f"session=300 triples (source={source_size}), master={master_size} triples, n=21")
    for name in QUERY_BINDINGS:
        expected = run(name, {}, scope)
        elapsed = []
        for _ in range(21):
            start = perf_counter()
            rows = run(name, {}, scope)
            elapsed.append((perf_counter() - start) * 1000)
            assert rows == expected
        print(f"{name}: median={median(elapsed):.3f} ms")
