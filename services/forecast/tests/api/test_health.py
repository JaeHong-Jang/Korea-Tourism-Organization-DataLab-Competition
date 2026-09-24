"""상태 확인 응답과 발행 전 계약 검증을 확인한다."""

import pytest
import yaml
from crowdcast import paths
from crowdcast.api.app import app
from crowdcast.api.routes import health
from crowdcast.config import Settings
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator, ValidationError


# 실제 ASGI 응답을 OpenAPI 정본과 요구된 상태·버전에 대조한다.
def test_health_matches_openapi() -> None:
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    assert response.json() == {"status": "ok", "version": "0.1.0"}

    # 구현의 검증기를 재사용하지 않고 정본 스키마를 직접 확인한다.
    contract = paths.REPO_ROOT / "packages" / "contracts" / "openapi" / "forecast.yaml"
    openapi = yaml.safe_load(contract.read_text(encoding="utf-8"))
    schema = openapi["paths"]["/health"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]
    Draft202012Validator(schema).validate(response.json())


# 잘못된 내부 응답이 라우트의 계약 검증에서 거부되는지 확인한다.
def test_health_validates_before_returning(monkeypatch: pytest.MonkeyPatch) -> None:
    broken_settings = Settings.model_construct(version=1)
    monkeypatch.setattr(health, "get_settings", lambda: broken_settings)
    with TestClient(app) as client, pytest.raises(ValidationError):
        client.get("/health")
