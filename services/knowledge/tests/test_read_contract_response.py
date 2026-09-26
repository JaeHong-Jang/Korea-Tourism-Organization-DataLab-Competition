"""조회 응답도 공통 계약 검사를 거쳐 잘못된 카드·그래프·온톨로지를 차단한다."""

import json
from typing import Any

import pytest
from contract_cases import SESSION_ID, memory_store
from fastapi.testclient import TestClient
from knowledge.api import claim_evidence, evidence, session_graph
from knowledge.api.app import create_app
from knowledge.api.contract_response import turtle_response
from knowledge.convert.documents import schema_problems


# 조회 계층의 구현 오류를 주입해 라우트가 검증 없는 본문을 내보내지 않게 한다.
@pytest.mark.parametrize(
    "module,function,path,content",
    [
        (claim_evidence, "claim_evidence", "/v1/claims/c-yeongjong-3/evidence", [{"id": "ev-missing"}]),
        (evidence, "evidence", "/v1/evidence/ev-rule-legal-hazard", {"id": "ev-missing"}),
        (session_graph, "session_graph", f"/v1/sessions/{SESSION_ID}/graph", []),
    ],
)
def test_read_routes_validate_responses(
    module: Any, function: str, path: str, content: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(module, function, lambda *args: content)
    with TestClient(create_app(memory_store())) as client:
        response = client.get(path)
        assert response.status_code == 500
        assert schema_problems(response.json(), "gate-report") == []


# Turtle 성공 응답은 JSON 문자열로 감싸지 않고 타입 오류는 계약 실패로 반환한다.
def test_turtle_contract_response() -> None:
    response = turtle_response("@prefix cc: <http://crowdcast.local/ont#> .")
    assert response.media_type == "text/turtle"
    assert response.body.startswith(b"@prefix")
    failure = turtle_response({"internal": "비공개"})
    assert failure.status_code == 500
    assert schema_problems(json.loads(failure.body), "gate-report") == []
    assert "비공개" not in failure.body.decode()
