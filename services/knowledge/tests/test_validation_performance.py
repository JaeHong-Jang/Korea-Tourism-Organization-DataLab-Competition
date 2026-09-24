"""계약 적재로 만든 300트리플 세션의 전체 SHACL 검증 시간을 측정한다."""

from statistics import median
from time import perf_counter

import pytest
from contract_cases import RDFLIB_NQUADS_WARNING, SESSION_ID
from knowledge.store.repository import CC, ID, MASTER, TBOX
from knowledge.validate.session import validate_session
from knowledge.validate.shapes import SHAPE_IDS
from rdflib import Literal
from shape_cases import candidate_store


# 고정 크기에서 최초 호출과 예열 후 다섯 번을 구분해 하드웨어 의존 수치를 기록한다.
@pytest.mark.filterwarnings(RDFLIB_NQUADS_WARNING)
def test_validation_300_triples() -> None:
    store = candidate_store(numeric=True, ood=True)
    graph = store.repository.read_graph(ID[SESSION_ID])
    source_triples = len(graph)
    assert source_triples <= 300
    for index in range(300 - source_triples):
        graph.add((ID[SESSION_ID], CC.note, Literal(f"영종 불꽃축제 검증 측정 메모 {index}")))
    assert len(graph) == 300
    store.repository.replace_graph(ID[SESSION_ID], graph)

    # 스냅샷 추출·그래프 합치기·SHACL·보고서까지 포함한 서비스 시간을 잰다.
    elapsed = []
    for _ in range(6):
        start = perf_counter()
        report = validate_session(store, SESSION_ID, 3, 2, SHAPE_IDS)
        elapsed.append((perf_counter() - start) * 1000)
        assert report["passed"], report
    master_size = len(store.repository.read_graph(MASTER))
    tbox_size = len(store.repository.read_graph(TBOX))
    print(
        f"300 triples: contract={source_triples}, padding={300 - source_triples}, "
        f"master={master_size}, tbox={tbox_size}; "
        f"first={elapsed[0]:.2f} ms, warm median={median(elapsed[1:]):.2f} ms, "
        f"warm max={max(elapsed[1:]):.2f} ms (n=5)"
    )
