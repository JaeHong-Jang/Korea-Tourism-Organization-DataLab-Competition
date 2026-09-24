"""검증 응답의 JSONL 기록·재기동 통과율·기록 장애 격리를 검증한다."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import orjson
import pytest
from contract_cases import RDFLIB_NQUADS_WARNING, SESSION_ID
from fastapi.testclient import TestClient
from knowledge import paths
from knowledge.api.app import create_app
from knowledge.store.repository import ID
from knowledge.store.validation_log import record_validation, shacl_pass_rate
from knowledge.validate.shapes import select_shapes
from rdflib.namespace import PROV
from shape_cases import candidate_store

pytestmark = pytest.mark.filterwarnings(RDFLIB_NQUADS_WARNING)
URL = f"/v1/sessions/{SESSION_ID}/validate"


# 실제 API 통과 두 건과 S08 실패 한 건을 순서대로 기록하고 재기동 뒤에도 비율을 읽는다.
def test_validation_log_pass_rate() -> None:
    store = candidate_store()
    with TestClient(create_app(store)) as client:
        params = {"revision": 3, "masterVersion": 2}
        assert client.post(URL, params=params).json()["passed"]
        assert client.post(URL, params={**params, "shapes": "S08"}).json()["passed"]
        graph = store.repository.read_graph(ID[SESSION_ID])
        graph.remove((ID["pr-f-yeongjong-2025"], PROV.used, ID["mr-v0-1-0"]))
        store.repository.replace_graph(ID[SESSION_ID], graph)
        failure = client.post(URL, params={**params, "shapes": "S08"})
        assert failure.status_code == 200
        assert not failure.json()["passed"]
    with TestClient(create_app(store)) as client:
        assert client.get("/v1/stats/datalab-usage").json()["shaclPassRate"] == pytest.approx(2 / 3)
    records = [
        orjson.loads(line) for line in (paths.STORE.parent / "validation_log.jsonl").read_bytes().splitlines()
    ]
    assert len(records) == 3
    for index, record in enumerate(records):
        assert datetime.fromisoformat(record.pop("at")).tzinfo is not None
        assert record == {
            "sessionId": SESSION_ID,
            "revision": 3,
            "masterVersion": 2,
            "shapes": list(select_shapes(None)) if index == 0 else ["S08"],
            "passed": index != 2,
        }


# 저장 위치가 디렉터리라 쓰기 실패해도 정상 검증 응답을 돌려준다.
def test_validation_log_write_failure(caplog: pytest.LogCaptureFixture) -> None:
    (paths.STORE.parent / "validation_log.jsonl").mkdir(parents=True)
    with TestClient(create_app(candidate_store())) as client:
        response = client.post(URL, params={"revision": 3, "masterVersion": 2})
        assert response.status_code == 200
        assert response.json()["passed"]
        assert client.get("/v1/stats/datalab-usage").json()["shaclPassRate"] is None
    assert "검증 기록 쓰기 실패" in caplog.text


# 비어 있거나 손상된 기록은 성공률을 추측하지 않는다.
@pytest.mark.parametrize("content", [b"", b"{", b'{"passed": "false"}\n'])
def test_empty_or_broken_log(content: bytes, caplog: pytest.LogCaptureFixture) -> None:
    paths.STORE.parent.mkdir(parents=True)
    (paths.STORE.parent / "validation_log.jsonl").write_bytes(content)
    assert shacl_pass_rate() is None
    if content:
        assert "검증 기록 읽기 실패" in caplog.text


# 동시 요청의 줄이 섞이거나 소실되지 않아 저장된 전체 모수와 비율이 일치한다.
def test_concurrent_validation_records() -> None:
    reports = [
        {"gate": "A", "revision": i, "masterVersion": 2, "passed": i % 2 == 0, "violations": []}
        for i in range(20)
    ]
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(record_validation, report, SESSION_ID, ("S08",)) for report in reports]
        assert [future.result(timeout=10) for future in futures] == reports
    records = [
        orjson.loads(line) for line in (paths.STORE.parent / "validation_log.jsonl").read_bytes().splitlines()
    ]
    assert len(records) == 20
    assert sorted(record["revision"] for record in records) == list(range(20))
    assert shacl_pass_rate() == 0.5


# 409·422 응답도 빠짐없이 한 번 기록하고 다른 API 오류는 검증 모수에서 제외한다.
def test_validation_error_reports_are_logged() -> None:
    with TestClient(create_app(candidate_store())) as client:
        for params, status in [
            ({"revision": 2, "masterVersion": 2}, 409),
            ({"revision": 3, "masterVersion": 2, "shapes": "S99"}, 422),
            ({}, 422),
        ]:
            response = client.post(URL, params=params)
            assert response.status_code == status
        assert client.post("/v1/master/model-runs", json={}).status_code == 422
        assert client.get("/v1/stats/datalab-usage").json()["shaclPassRate"] == 0.0
    records = [
        orjson.loads(line) for line in (paths.STORE.parent / "validation_log.jsonl").read_bytes().splitlines()
    ]
    assert len(records) == 3
    assert all(record["passed"] is False for record in records)
    assert all((record["revision"], record["masterVersion"]) == (3, 2) for record in records)
    assert records[1]["shapes"] == ["S99"]


# 계약 위반 반환과 내부 예외도 최종 500 응답의 실패 값만 통과율에 반영한다.
@pytest.mark.parametrize("raises", [False, True])
def test_internal_validation_failures_are_logged(raises: bool, monkeypatch: pytest.MonkeyPatch) -> None:
    from knowledge.api import validate

    # 검증 엔진 장애를 주입해 계약 경계의 실패 보고서가 저장되는지 확인한다.
    def broken_validation(*args: object) -> dict:
        if raises:
            raise RuntimeError("영종 검증 엔진 장애")
        return {"passed": True}

    monkeypatch.setattr(validate, "validate_session", broken_validation)
    with TestClient(create_app(candidate_store()), raise_server_exceptions=False) as client:
        response = client.post(URL, params={"revision": 3, "masterVersion": 2})
        assert response.status_code == 500
        assert not response.json()["passed"]
        assert client.get("/v1/stats/datalab-usage").json()["shaclPassRate"] == 0.0
    records = [
        orjson.loads(line) for line in (paths.STORE.parent / "validation_log.jsonl").read_bytes().splitlines()
    ]
    assert len(records) == 1
    assert records[0]["passed"] is False
