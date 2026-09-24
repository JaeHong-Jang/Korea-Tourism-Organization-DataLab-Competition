"""모델 카드의 API 등록·충돌·S08 계보와 사용 모델 포인터의 기동 적재를 검증한다."""

import gc
import logging
from pathlib import Path
from typing import Any

import orjson
import pytest
from contract_cases import SESSION_ID, read_json
from fastapi.testclient import TestClient
from knowledge import paths
from knowledge.api.app import create_app
from knowledge.convert.documents import schema_problems
from knowledge.store.facts import KnowledgeStore
from knowledge.store.repository import ID, MASTER
from rdflib import Graph
from rdflib.compare import isomorphic

CARD = paths.CONTRACTS / "fixtures/model-card/valid-v0-1-0.json"
URL = "/v1/master/model-runs"


# 포인터만 읽어 버전별 카드 경로를 찾도록 실제 파일 구조를 만든다.
def write_promoted(card: dict) -> Path:
    pointer = paths.DATA_ROOT / "reports/backtest/promoted.json"
    pointer.parent.mkdir(parents=True, exist_ok=True)
    pointer.write_bytes(orjson.dumps({"modelVersion": card["modelVersion"]}))
    path = paths.DATA_ROOT / "models" / card["modelVersion"] / "model_card.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(orjson.dumps(card))
    return path


# 기준 모델이 없을 때 S08이 실패하고 실제 카드 등록 뒤 새 기준 버전에서만 통과한다.
def test_registered_model_makes_s08_pass() -> None:
    store = KnowledgeStore()
    graph = Graph().parse(Path(__file__).parent / "fixtures/model_runs/forecast_lineage.ttl")
    store.repository.replace_graph(ID[SESSION_ID], graph)
    with TestClient(create_app(store)) as client:
        params = {"revision": 0, "masterVersion": 1, "shapes": "S08"}
        before = client.post(f"/v1/sessions/{SESSION_ID}/validate", params=params)
        assert before.status_code == 200
        assert not before.json()["passed"]
        assert {violation["shapeId"] for violation in before.json()["violations"]} == {"S08"}
        registration = client.post(URL, json=read_json(CARD))
        assert registration.status_code == 200
        assert registration.json() == {"masterVersion": 2}
        stale = client.post(f"/v1/sessions/{SESSION_ID}/validate", params=params)
        assert stale.status_code == 409
        params["masterVersion"] = 2
        after = client.post(f"/v1/sessions/{SESSION_ID}/validate", params=params)
    assert after.status_code == 200
    assert after.json()["passed"]
    assert after.json()["violations"] == []
    for response in (before, stale, after):
        assert schema_problems(response.json(), "gate-report") == []


# 같은 JSON 내용은 멱등이고 유효한 다른 내용은 409이며 기준 그래프를 보존한다.
def test_registration_retry_and_conflict() -> None:
    store = KnowledgeStore()
    card = read_json(CARD)
    with TestClient(create_app(store)) as client:
        assert client.post(URL, json=card).json() == {"masterVersion": 2}
        before = store.repository.read_graph(MASTER)
        retry = client.post(URL, json=dict(reversed(list(card.items()))))
        assert retry.status_code == 200
        assert retry.json() == {"masterVersion": 2}
        conflict = client.post(URL, json={**card, "notes": "영종 예보의 학습 설명 변경"})
        assert conflict.status_code == 409
        assert schema_problems(conflict.json(), "gate-report") == []
        assert client.get("/v1/master/version").json() == {"masterVersion": 2}
    assert isomorphic(before, store.repository.read_graph(MASTER))


# 본문 구조와 중첩 날짜 계약 위반은 등록이나 버전 증가 없이 거절한다.
@pytest.mark.parametrize(
    "body",
    [
        {},
        [],
        None,
        *[
            {**read_json(CARD), "createdAt": stamp}
            for stamp in [
                "잘못된 날짜",
                "2026-09-25T12:00:00",
                "2026-02-30T12:00:00Z",
                "2026-09-25T12:00:00+09:60",
            ]
        ],
        {**read_json(CARD), "trainRange": {"from": "2026-02-30", "to": "2026-09-25"}},
    ],
)
def test_invalid_card_is_422(body: Any) -> None:
    store = KnowledgeStore()
    with TestClient(create_app(store)) as client:
        response = client.post(URL, json=body)
    assert response.status_code == 422
    assert schema_problems(response.json(), "gate-report") == []
    assert store.master.snapshot()[0] == 1


# 실제 디스크 저장소를 닫고 재기동해도 같은 카드가 기준 버전을 다시 올리지 않는다.
def test_startup_load_and_restart(caplog: pytest.LogCaptureFixture) -> None:
    card = read_json(CARD)
    write_promoted(card)
    caplog.set_level(logging.INFO, logger="knowledge.api.model_runs")
    for _ in range(2):
        with TestClient(create_app()) as client:
            assert client.get("/health").status_code == 200
            assert client.get("/v1/master/version").json() == {"masterVersion": 2}
            assert card["id"] in client.app.state.knowledge.master.snapshot()[1]["modelRuns"]
        del client
        gc.collect()
    assert caplog.text.count("사용 모델 카드 등록: modelVersion=v0.1.0 masterVersion=2") == 2


# 누락·구문 오류·스키마 위반·다른 버전·경로 오류는 경고만 남기고 기동을 허용한다.
@pytest.mark.parametrize(
    "problem",
    [
        "missing-pointer",
        "missing-card",
        "broken-pointer",
        "broken-card",
        "invalid-card",
        "invalid-time",
        "mismatch",
        "path",
    ],
)
def test_startup_bad_artifacts_warn(problem: str, caplog: pytest.LogCaptureFixture) -> None:
    card_path = write_promoted(read_json(CARD))
    pointer = paths.DATA_ROOT / "reports/backtest/promoted.json"
    if problem == "missing-pointer":
        pointer.unlink()
    elif problem == "missing-card":
        card_path.unlink()
    elif problem == "broken-pointer":
        pointer.write_bytes(b"{")
    elif problem == "broken-card":
        card_path.write_bytes(b"{")
    elif problem == "invalid-card":
        card_path.write_bytes(orjson.dumps({"modelVersion": "v0.1.0"}))
    elif problem == "invalid-time":
        card_path.write_bytes(orjson.dumps({**read_json(CARD), "createdAt": "잘못된 날짜"}))
    elif problem == "mismatch":
        card_path.write_bytes(orjson.dumps({**read_json(CARD), "modelVersion": "v0.2.0"}))
    else:
        pointer.write_bytes(orjson.dumps({"modelVersion": "../other-model"}))
    with TestClient(create_app(KnowledgeStore())) as client:
        assert client.get("/health").status_code == 200
        assert client.get("/v1/master/version").json() == {"masterVersion": 1}
        assert client.app.state.knowledge.master.snapshot()[1]["modelRuns"] == set()
    assert "사용 모델 카드 기동 적재 실패" in caplog.text


# 기존 id와 충돌한 기동 카드도 기존 기준 내용을 덮어쓰지 않는다.
def test_startup_conflict_warns(caplog: pytest.LogCaptureFixture) -> None:
    store = KnowledgeStore()
    card = read_json(CARD)
    store.master.register_model_run(card)
    write_promoted({**card, "notes": "충돌하는 영종 학습 기록"})
    before = store.repository.read_graph(MASTER)
    with TestClient(create_app(store)) as client:
        assert client.get("/v1/master/version").json() == {"masterVersion": 2}
    assert isomorphic(before, store.repository.read_graph(MASTER))
    assert "사용 모델 카드 기동 적재 실패" in caplog.text
