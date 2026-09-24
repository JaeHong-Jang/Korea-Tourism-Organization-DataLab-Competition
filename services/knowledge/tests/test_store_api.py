"""원자성·재시도·동시 요청·재시작과 서비스 상태를 검증한다."""

import gc
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from pathlib import Path

import pytest
from contract_cases import INTEGRITY, RDFLIB_NQUADS_WARNING, SESSION_ID, load_before, memory_store, read_json
from fastapi.testclient import TestClient
from knowledge.api.app import create_app
from knowledge.convert.documents import schema_problems
from knowledge.paths import CONTRACTS
from knowledge.store.facts import IntegrityError, KnowledgeStore
from knowledge.store.repository import CC, ID, MASTER
from rdflib import Literal
from rdflib.compare import isomorphic
from rdflib.namespace import RDF


# health와 기준 버전은 명세의 정확한 응답 형태를 지킨다.
def test_health_and_version() -> None:
    store = KnowledgeStore()
    with TestClient(create_app(store)) as client:
        assert client.get("/health").json() == {"status": "ok", "version": "0.1.0"}
        assert client.get("/v1/master/version").json() == {"masterVersion": 1}


# 새 사실 두 번은 1·2이고 동일 재적재는 그래프까지 그대로다.
@pytest.mark.filterwarnings(RDFLIB_NQUADS_WARNING)
def test_revision_retry_and_atomic_batch() -> None:
    store = memory_store()
    event = read_json(CONTRACTS / "fixtures/event/valid-yeongjong.json")
    similar = read_json(CONTRACTS / "fixtures/similar-event/valid-yeongjong-2024.json")
    assert store.load_facts(SESSION_ID, "event", [event]) == 1
    assert store.load_facts(SESSION_ID, "similar-event", [similar]) == 2
    before = store.repository.read_graph(ID[SESSION_ID])
    assert store.load_facts(SESSION_ID, "similar-event", [similar]) == 2
    assert isomorphic(before, store.repository.read_graph(ID[SESSION_ID]))

    # 앞 항목이 정상이더라도 뒤 항목 실패 시 요청 전체를 되돌린다.
    fresh = {**event, "id": "e-yeongjong-fireworks-2026"}
    conflict = {**event, "sigunguCode": "28177"}
    with TestClient(create_app(store)) as client:
        response = client.post(
            f"/v1/sessions/{SESSION_ID}/facts", json={"schema": "event", "items": [fresh, conflict]}
        )
    assert response.status_code == 422
    assert schema_problems(response.json(), "gate-report") == []
    assert response.json()["revision"] == 2
    assert isomorphic(before, store.repository.read_graph(ID[SESSION_ID]))
    assert "e-yeongjong-fireworks-2026" not in store.scope(SESSION_ID)["events"]


# 여러 사실을 한 요청에 넣어도 내용 revision은 한 번만 오른다.
@pytest.mark.filterwarnings(RDFLIB_NQUADS_WARNING)
def test_batch_revision_and_in_batch_conflict() -> None:
    store = memory_store()
    event = read_json(CONTRACTS / "fixtures/event/valid-yeongjong.json")
    other = {**event, "id": "e-yeongjong-fireworks-2026"}
    assert store.load_facts(SESSION_ID, "event", [event, other]) == 1
    conflicting = {**event, "name": "영종 불꽃축제 변경"}
    with pytest.raises(IntegrityError):
        store.load_facts("s-empty-yeongjong", "event", [event, conflicting])
    assert store.scope("s-empty-yeongjong")["revision"] == 0


# 이미 중첩 적재된 근거를 단독으로 재전송해도 빈 노드를 중복 생성하지 않는다.
@pytest.mark.filterwarnings(RDFLIB_NQUADS_WARNING)
def test_nested_evidence_retry_keeps_graph() -> None:
    store = memory_store()
    load_before(store, "claim")
    forecast = read_json(CONTRACTS / "fixtures/forecast/valid-yeongjong.json")
    before = store.repository.read_graph(ID[SESSION_ID])
    for evidence in forecast["evidence"]:
        assert store.load_facts(SESSION_ID, "evidence", [evidence]) == 4
    assert isomorphic(before, store.repository.read_graph(ID[SESSION_ID]))


# 같은 세션으로 동시에 쓰더라도 새 정의와 revision을 잃지 않는다.
@pytest.mark.filterwarnings(RDFLIB_NQUADS_WARNING)
def test_concurrent_facts_are_serialized() -> None:
    store = memory_store()
    event = read_json(CONTRACTS / "fixtures/event/valid-yeongjong.json")
    events = [{**event, "id": f"e-yeongjong-fireworks-load-{index}"} for index in range(8)]
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(store.load_facts, SESSION_ID, "event", [doc]) for doc in events]
        assert sorted(future.result(timeout=20) for future in futures) == list(range(1, 9))
    scope = store.scope(SESSION_ID)
    assert scope["revision"] == 8
    assert set(scope["events"]) == {event["id"] for event in events}


# 등록되지 않은 모델은 거부하고 실제 기준 그래프에 넣은 뒤에만 허용한다.
@pytest.mark.filterwarnings(RDFLIB_NQUADS_WARNING)
def test_master_definitions_come_from_graph() -> None:
    store = KnowledgeStore()
    load_before(store, "forecast")
    forecast = read_json(CONTRACTS / "fixtures/forecast/valid-yeongjong.json")
    with pytest.raises(IntegrityError, match="mr-v0-1-0"):
        store.load_facts(SESSION_ID, "forecast", [forecast])
    card = read_json(next((CONTRACTS / "fixtures/model-card").glob("valid-*.json")))
    assert store.master.register_model_run(card) == 2
    assert store.master.register_model_run(card) == 2
    assert store.load_facts(SESSION_ID, "forecast", [forecast]) == 4

    # id 목록 파일에 있어도 저장된 클래스 선언이 없으면 기준 참조가 아니다.
    graph = store.repository.read_graph(MASTER)
    graph.remove((ID["ds-kto-visitors-15101972"], RDF.type, CC.Dataset))
    store.repository.replace_graph(MASTER, graph)
    assert "ds-kto-visitors-15101972" not in store.master.snapshot()[1]["datasets"]


# 디스크 저장소 재시작 뒤에도 문장 전이와 충돌 판정이 보존된다.
@pytest.mark.filterwarnings(RDFLIB_NQUADS_WARNING)
def test_restart_preserves_scope_and_claim_state(tmp_path: Path) -> None:
    path = tmp_path / "knowledge"
    store = KnowledgeStore(path)
    card = read_json(next((CONTRACTS / "fixtures/model-card").glob("valid-*.json")))
    store.master.register_model_run(card)
    case = read_json(INTEGRITY / "sequences/valid-new-forecast.json")
    for step in case["steps"]:
        if "facts" in step:
            store.load_facts(SESSION_ID, step["facts"], [step["doc"]])
    before = store.scope(SESSION_ID)
    del store
    gc.collect()

    # 새 저장소 객체는 메모리 캐시 없이 그래프에서 범위를 다시 만든다.
    restored = KnowledgeStore(path)
    assert restored.scope(SESSION_ID) == before
    assert restored.master.snapshot()[0] == 2
    assert restored.publish(SESSION_ID, case["steps"][-1]["publish"]) == before["revision"]
    graph = restored.repository.read_graph(ID[SESSION_ID])
    assert set(graph.objects(ID["c-yeongjong-3"], CC.status)) == {Literal("published")}
    changed = deepcopy(before["events"]["e-yeongjong-fireworks-2025"])
    changed["sigunguCode"] = "28177"
    with pytest.raises(IntegrityError):
        restored.load_facts(SESSION_ID, "event", [changed])


# 출력 전용 예보서와 잘못된 요청도 gate-report 형식으로 거부한다.
@pytest.mark.parametrize(
    "body",
    [
        {"schema": "forecast-report", "items": [{}]},
        {"schema": "event", "items": []},
        {"schema": "event", "items": [{}]},
        {"schema": "event", "items": [None]},
        {"schema": "event", "items": [{"id": None}]},
        {"schema": "event", "items": [{"id": 123}]},
        {},
    ],
)
def test_invalid_request_is_gate_report(body: dict) -> None:
    store = memory_store()
    with TestClient(create_app(store)) as client:
        response = client.post(f"/v1/sessions/{SESSION_ID}/facts", json=body)
    assert response.status_code == 422
    assert schema_problems(response.json(), "gate-report") == []
    assert store.scope(SESSION_ID)["revision"] == 0
