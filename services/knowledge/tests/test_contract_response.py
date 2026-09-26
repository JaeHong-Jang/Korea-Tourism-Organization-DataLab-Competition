"""실제 응답 경로에서 계약 위반을 500으로 차단하고 내부 내용을 숨기는지 검사한다."""

import json
from typing import Any

import pytest
from contract_cases import SESSION_ID, memory_store, read_json
from fastapi.testclient import TestClient
from knowledge.api import app, publish, validate
from knowledge.api.contract_response import contract_response
from knowledge.convert.documents import schema_problems
from knowledge.paths import CONTRACTS
from knowledge.store.facts import IntegrityError, violations_for
from knowledge.validate.snapshot import ScopeConflict

BASE = f"/v1/sessions/{SESSION_ID}"
INTERNAL_DETAIL = "내부 응답 상세는 클라이언트에 보이지 않아야 한다"


# 성공·실패 응답 어느 쪽이든 계약 필수 필드와 타입을 실제로 검사한다.
@pytest.mark.parametrize(
    "schema,content",
    [
        ("health", {"status": "ok"}),
        ("facts", {"revision": "1"}),
        ("master-version", {"masterVersion": True}),
        ("gate-report", {"passed": False, "revision": 3, "masterVersion": 2}),
    ],
)
def test_malformed_response_is_logged_and_replaced(
    schema: str, content: dict, caplog: pytest.LogCaptureFixture
) -> None:
    content["internal"] = INTERNAL_DETAIL
    response = contract_response(content, schema)
    assert response.status_code == 500
    report = json.loads(response.body)
    assert schema_problems(report, "gate-report") == []
    assert report["passed"] is False
    assert INTERNAL_DETAIL not in response.body.decode()
    assert "응답 계약 위반" in caplog.text
    assert INTERNAL_DETAIL not in caplog.text


# 서비스의 잘못된 성공 반환값이 라우트에서 그대로 나가지 않아야 한다.
@pytest.mark.parametrize("route", ["facts", "validate", "publish"])
def test_routes_validate_success_before_sending(route: str, monkeypatch: pytest.MonkeyPatch) -> None:
    store = memory_store()

    # 내부 구현 오류를 주입해 응답 검증을 빼면 바로 회귀하도록 만든다.
    def invalid_result(*args: Any, **kwargs: Any) -> Any:
        return INTERNAL_DETAIL if route == "facts" else {"internal": INTERNAL_DETAIL}

    if route == "facts":
        monkeypatch.setattr(store, "load_facts", invalid_result)
    else:
        module = validate if route == "validate" else publish
        monkeypatch.setattr(module, f"{route}_session", invalid_result)
    body = {"schema": "event", "items": [read_json(CONTRACTS / "fixtures/event/valid-yeongjong.json")]}
    with TestClient(app.create_app(store)) as client:
        response = client.post(BASE + f"/{route}", json=body, params={"revision": 0, "masterVersion": 2})
    assert response.status_code == 500
    assert schema_problems(response.json(), "gate-report") == []
    assert INTERNAL_DETAIL not in response.text


# facts 422·409와 두 게이트의 오류 응답도 공통 계약 검사로 차단돼야 한다.
@pytest.mark.parametrize("route", ["facts", "validate", "publish"])
@pytest.mark.parametrize("kind", ["integrity", "conflict"])
def test_routes_validate_error_before_sending(route: str, kind: str, monkeypatch: pytest.MonkeyPatch) -> None:
    store = memory_store()
    failure = IntegrityError(0, 2, violations_for(SESSION_ID, [INTERNAL_DETAIL]))
    failure.report["passed"] = "false"
    error = ScopeConflict(failure.report) if kind == "conflict" else failure

    # 예외가 올바른 형태의 보고서를 만들지 못한 경우까지 API 경계에서 잡는다.
    def invalid_error(*args: Any, **kwargs: Any) -> None:
        raise error

    if route == "facts":
        monkeypatch.setattr(store, "load_facts", invalid_error)
    else:
        module = validate if route == "validate" else publish
        monkeypatch.setattr(module, f"{route}_session", invalid_error)
    with TestClient(app.create_app(store)) as client:
        response = client.post(
            BASE + f"/{route}",
            json={"schema": "event", "items": [{}]},
            params={"revision": 0, "masterVersion": 2},
        )
    assert response.status_code == 500
    assert schema_problems(response.json(), "gate-report") == []
    assert INTERNAL_DETAIL not in response.text


# 프레임워크 요청 검증 실패도 별도의 미검증 JSON 경로를 만들지 않는다.
def test_request_validation_error_is_checked(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(app, "violations_for", lambda *args: [{"message": INTERNAL_DETAIL}])
    with TestClient(app.create_app(memory_store())) as client:
        response = client.post(BASE + "/facts", json={})
    assert response.status_code == 500
    assert schema_problems(response.json(), "gate-report") == []
    assert INTERNAL_DETAIL not in response.text


# 정의되지 않은 라우트·메서드와 내부 장애도 계약 오류 응답을 유지한다.
def test_framework_and_server_errors_use_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    store = memory_store()

    # 예외 메시지는 서버 구현에만 남고 응답 본문에는 포함되지 않아야 한다.
    def fail_validation(*args: Any, **kwargs: Any) -> None:
        raise RuntimeError(INTERNAL_DETAIL)

    monkeypatch.setattr(validate, "validate_session", fail_validation)
    with TestClient(app.create_app(store), raise_server_exceptions=False) as client:
        responses = [
            (client.get("/v1/unknown"), 404),
            (client.get(BASE + "/facts"), 405),
            (client.post(BASE + "/validate", params={"revision": 0, "masterVersion": 2}), 500),
        ]
    for response, status in responses:
        assert response.status_code == status
        assert schema_problems(response.json(), "gate-report") == []
        assert INTERNAL_DETAIL not in response.text
    assert responses[1][0].headers["allow"] == "POST"
