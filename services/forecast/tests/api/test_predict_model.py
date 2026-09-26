"""사용 모델 포인터 교체·발행본 무결성·요청 계약 실패를 검증한다."""

import json
from pathlib import Path

import pytest
from crowdcast import paths
from crowdcast.api.assemble import forecast, model
from fastapi.testclient import TestClient


# 후보 latest가 달라도 사용 포인터의 버전·검증 상태만 응답한다.
def test_promoted_pointer_reload(client: TestClient, forecast_data: Path, event: dict) -> None:
    first = client.post("/v1/predict", json=event).json()
    assert first["modelVersion"] == "v0.1.0"
    assert first["predictionRun"]["modelVerdict"] == "미검증"
    (forecast_data / "promoted.json").write_text(
        json.dumps(
            {
                "modelVersion": "v0.2.0",
                "runId": "bt-v0.2.0",
                "verdict": "통과",
            }
        )
    )
    second = client.post("/v1/predict", json=event).json()
    assert second["modelVersion"] == second["predictionRun"]["modelVersion"] == "v0.2.0"
    assert second["predictionRun"]["modelRunId"] == "mr-v0.2.0"
    assert second["predictionRun"]["modelVerdict"] == "통과"
    assert first["id"] != second["id"]
    assert client.get("/v1/model-card/latest").json()["modelVersion"] == "v0.2.0"


# 모델이 메모리에 남아 있어도 포인터가 사라지면 이전 모델로 계속 예보하지 않는다.
def test_pointer_missing_is_503(client: TestClient, forecast_data: Path, event: dict) -> None:
    model.current_model()
    (forecast_data / "promoted.json").unlink()
    assert client.post("/v1/predict", json=event).status_code == 503


# 금지 경로는 내부 자료 오류로 거부하며 모델 카드가 있다고 읽지 않는다.
@pytest.mark.parametrize("version", [".staging-v0.1.0", "g0", "../v0.1.0"])
def test_unpublished_model_path(client: TestClient, forecast_data: Path, event: dict, version: str) -> None:
    (forecast_data / "promoted.json").write_text(
        json.dumps({"modelVersion": version, "runId": "bt-v0.1.0", "verdict": "통과"})
    )
    assert client.post("/v1/predict", json=event).status_code != 200


# 발행본 카드와 모델 본체의 피처 목록이 어긋나면 잘못된 열로 추론하지 않는다.
def test_model_features_mismatch(client: TestClient, forecast_data: Path, event: dict) -> None:
    file = paths.MODELS / "v0.1.0/features.json"
    value = json.loads(file.read_text())
    value["features"] = value["features"][::-1]
    file.write_text(json.dumps(value))
    model.load_model.cache_clear()
    assert client.post("/v1/predict", json=event).status_code == 500


# 요청과 응답 양쪽의 스키마 검증을 실제 라우트에서 확인한다.
def test_response_contract_violation_is_500(
    client: TestClient, forecast_data: Path, event: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(forecast, "prediction_run", lambda *args: {"id": "broken"})
    assert client.post("/v1/predict", json=event).status_code == 500


# 누락·비유한 숫자·역전 일정은 모델 선택 전에 요청 오류로 분류한다.
@pytest.mark.parametrize(
    "change", [{"extra": 1}, {"startsAt": "2025-11-01T19:00:00+09:00"}, {"type": "미정"}]
)
def test_predict_bad_request(client: TestClient, event: dict, change: dict) -> None:
    assert client.post("/v1/predict", json={**event, **change}).status_code == 400


# 잘못된 JSON은 FastAPI 기본 422 대신 계약의 400으로 통일한다.
def test_predict_invalid_json(client: TestClient) -> None:
    assert client.post("/v1/predict", content="{").status_code == 400
