"""계보의 모델 카드 후속 기동 적재·통계 계약·CLI와 재시작을 검증한다."""

import gc
import os
import subprocess
import sys

import pytest
from fastapi.testclient import TestClient
from knowledge import paths
from knowledge.api.app import create_app
from knowledge.api.contract_response import response_validator
from knowledge.lineage.query import lineage_for_model
from knowledge.store.facts import KnowledgeStore
from knowledge.store.repository import MASTER
from lineage_cases import runtime_files


# 디스크 저장소를 재기동해도 모델·계보가 각각 한 번만 버전을 올리고 통계는 실제 크기를 센다.
def test_startup_restart_and_stats() -> None:
    _, card = runtime_files()
    for _ in range(2):
        with TestClient(create_app()) as client:
            store = client.app.state.knowledge
            assert client.get("/v1/master/version").json() == {"masterVersion": 3}
            assert lineage_for_model(card["modelVersion"], store.repository)["datasets"]
            response = client.get("/v1/stats/graph")
            assert response.status_code == 200
            stats = response.json()
            validator = response_validator("ops-status").evolve(schema={
                "$ref": "https://crowdcast.local/schemas/ops-status.schema.json#/$defs/graphStats",
            })
            assert list(validator.iter_errors(stats)) == []
            assert stats == {
                "masterVersion": 3, "masterTriples": len(store.repository.read_graph(MASTER)),
                "sessions": 0, "sessionTriples": 0,
            }
        del client, store
        gc.collect()


# 누락된 계보는 선택 기능으로 건너뛰고 손상된 계보도 모델 카드는 보존한다.
@pytest.mark.parametrize("missing", [True, False])
def test_bad_startup_lineage_preserves_model(missing: bool, caplog: pytest.LogCaptureFixture) -> None:
    path, card = runtime_files()
    if missing:
        path.unlink()
    else:
        path.write_bytes(b"{")
    with TestClient(create_app(KnowledgeStore())) as client:
        assert client.get("/health").status_code == 200
        assert client.get("/v1/master/version").json() == {"masterVersion": 2}
        assert card["id"] in client.app.state.knowledge.master.snapshot()[1]["modelRuns"]
    assert ("파이프라인 계보 기동 적재 실패" in caplog.text) is not missing


# 별도 Python 프로세스의 CLI도 같은 저장소·멱등 규칙과 오류 종료 코드를 쓴다.
def test_cli_load_and_invalid_file() -> None:
    path, card = runtime_files()
    env = {**os.environ, "CROWDCAST_DATA_ROOT": str(paths.DATA_ROOT)}
    command = [sys.executable, "-m", "knowledge.lineage", "load", str(path)]
    for _ in range(2):
        result = subprocess.run(command, env=env, capture_output=True, text=True, timeout=30, check=False)
        assert result.returncode == 0, result.stderr
        assert result.stdout.strip() == "masterVersion=3"
    path.write_bytes(b"{")
    result = subprocess.run(command, env=env, capture_output=True, text=True, timeout=30, check=False)
    assert result.returncode == 1
    assert "계보 적재 실패" in result.stderr
    store = KnowledgeStore(paths.STORE)
    assert store.master.snapshot()[0] == 3
    assert lineage_for_model(card["modelVersion"], store.repository)["datasets"]
