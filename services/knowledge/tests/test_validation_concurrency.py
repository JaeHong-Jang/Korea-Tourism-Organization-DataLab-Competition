"""검증·발행 중의 동시 쓰기와 저장 실패가 스냅샷을 깨뜨리지 않는지 검증한다."""

from concurrent.futures import ThreadPoolExecutor
from threading import Event

import pytest
from contract_cases import RDFLIB_NQUADS_WARNING, SESSION_ID, read_json
from fastapi.testclient import TestClient
from knowledge.api.app import create_app
from knowledge.paths import CONTRACTS
from knowledge.store.repository import ID
from knowledge.validate import publish, session
from rdflib import Graph, URIRef
from rdflib.compare import isomorphic
from shape_cases import CLAIM_ID, candidate_store
from test_validate_api import BASE, assert_report

pytestmark = pytest.mark.filterwarnings(RDFLIB_NQUADS_WARNING)


# API가 검증하는 동안 사실과 모델 등록 모두 잠금 뒤에서 기다려야 한다.
@pytest.mark.parametrize("route", ["validate", "publish"])
@pytest.mark.parametrize("write_kind", ["facts", "master"])
def test_scope_locks_cover_validation_and_publish(
    monkeypatch: pytest.MonkeyPatch, route: str, write_kind: str
) -> None:
    store = candidate_store()
    entered, release, writer_started = Event(), Event(), Event()
    module = session if route == "validate" else publish
    original = module.shacl_violations

    # 검사 한가운데를 잡아 실제로 두 저장소 잠금이 잡혀 있는지 확인한다.
    def held_validation(graph: Graph, selected: tuple[str, ...]) -> list[dict]:
        entered.set()
        assert release.wait(10), "검증 대기 해제 실패"
        return original(graph, selected)

    # 검증과 같은 저장소 객체의 공개 쓰기 경로로 경쟁 요청을 보낸다.
    def write() -> int:
        writer_started.set()
        if write_kind == "facts":
            event = read_json(CONTRACTS / "fixtures/event/valid-yeongjong.json")
            event["id"] = "e-yeongjong-fireworks-2026"
            return store.load_facts(SESSION_ID, "event", [event])
        card = read_json(CONTRACTS / "fixtures/model-card/valid-v0-1-0.json")
        card["id"] = "mr-v0-2-0"
        return store.master.register_model_run(card)

    monkeypatch.setattr(module, "shacl_violations", held_validation)
    with TestClient(create_app(store)) as client, ThreadPoolExecutor(max_workers=2) as pool:
        validation = pool.submit(client.post, BASE + f"/{route}", params={"revision": 3, "masterVersion": 2})
        try:
            assert entered.wait(10), "검증 진입 실패"
            for lock in (store.repository.session_lock(SESSION_ID), store.repository.master_lock):
                acquired = lock.acquire(blocking=False)
                if acquired:
                    lock.release()
                assert not acquired
            writing = pool.submit(write)
            assert writer_started.wait(10), "동시 쓰기 진입 실패"
            assert not writing.done()
        finally:
            release.set()
        report = assert_report(validation.result(timeout=10), passed=True)
        assert (report["revision"], report["masterVersion"]) == (3, 2)
        assert writing.result(timeout=10) == (4 if write_kind == "facts" else 3)

        # 범위가 바뀐 뒤 이전 요청을 재사용하면 반드시 409가 된다.
        response = client.post(BASE + f"/{route}", params={"revision": 3, "masterVersion": 2})
        assert_report(response, passed=False, status=409)
    if route == "publish":
        assert store.scope(SESSION_ID)["claims"][CLAIM_ID]["status"] == "published"


# 저장 시도 자체가 실패하면 메모리 사본의 상태 변경이 저장소로 새지 않는다.
def test_publish_storage_failure_leaves_all_candidates(monkeypatch: pytest.MonkeyPatch) -> None:
    store = candidate_store(numeric=True)
    before = store.repository.read_graph(ID[SESSION_ID])

    # 실제 쓰기 직전에 장애를 넣어 후보 원문을 제자리 수정하지 않았는지 확인한다.
    def fail_write(graph_id: URIRef, graph: Graph) -> None:
        raise RuntimeError("테스트 저장 장애")

    monkeypatch.setattr(store.repository, "replace_graph", fail_write)
    with pytest.raises(RuntimeError, match="테스트 저장 장애"):
        publish.publish_session(store, SESSION_ID, 3, 2)
    assert isomorphic(before, store.repository.read_graph(ID[SESSION_ID]))
    assert all(claim["status"] == "candidate" for claim in store.scope(SESSION_ID)["claims"].values())
