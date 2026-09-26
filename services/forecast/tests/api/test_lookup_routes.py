"""조회 라우트의 요청·응답 계약과 발행 포인터 교체 및 오류 상태를 검증한다."""

import json
from pathlib import Path

import pytest
from crowdcast import paths
from crowdcast.api.assemble.artifacts import published_path
from crowdcast.api.contract import validate
from crowdcast.api.routes import geocode
from fastapi.testclient import TestClient


# 모호한 후보는 순서와 값까지 기존 geocode 결과 그대로 전달한다.
def test_geocode_keeps_candidates(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    candidates = [
        {"sigunguCode": "28110", "sigunguName": "인천 중구", "lat": 37.49, "lng": 126.58, "score": 0.8},
        {"sigunguCode": "11140", "sigunguName": "서울 중구", "lat": 37.56, "lng": 126.99, "score": 0.8},
    ]
    calls = []

    # 전달받은 입력과 후보 원문을 함께 확인한다.
    def search(venue: str, hint: str | None) -> list[dict]:
        calls.append((venue, hint))
        return candidates

    monkeypatch.setattr(geocode, "candidates", search)
    result = client.post("/v1/geocode", json={"venueText": "중구 중앙공원", "sidoHint": None})
    assert result.status_code == 200
    assert result.json() == {"candidates": candidates}
    assert calls == [("중구 중앙공원", None)]


# JSON 문법·필수값·타입 위반은 요청 오류로 드러낸다.
@pytest.mark.parametrize("value", [{}, {"venueText": 3}, {"venueText": "중구", "sidoHint": False}, []])
def test_geocode_invalid_request(client: TestClient, value: object) -> None:
    assert client.post("/v1/geocode", json=value).status_code == 400
    assert client.post("/v1/geocode", content=b"{").status_code == 400


# 하위 함수가 잘못된 응답을 주면 정상 후보로 발행하지 않는다.
def test_geocode_invalid_response(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(geocode, "candidates", lambda *args: [{"sigunguCode": "오류"}])
    assert client.post("/v1/geocode", json={"venueText": "영종"}).status_code == 500


# 두 문서 모두 사용 포인터를 따르고 후보 latest.json은 무시한다.
@pytest.mark.parametrize(
    "endpoint,schema,filename",
    [
        ("model-card", "model-card", "model_card.json"),
        ("backtest", "backtest-summary", "backtest.json"),
    ],
)
def test_promoted_documents(
    client: TestClient,
    model_data: Path,
    endpoint: str,
    schema: str,
    filename: str,
) -> None:
    response = client.get(f"/v1/{endpoint}/latest")
    assert response.status_code == 200
    assert response.json()["modelVersion"] == "v0.1.0"
    validate(schema, response.json())
    root = paths.MODELS / "v0.1.0" if endpoint == "model-card" else model_data / "bt-v0.1.0"
    assert response.json() == json.loads((root / filename).read_text())

    # 원자적 포인터 교체를 다음 요청에 반영하고 같은 요청은 바이트 단위로 재현한다.
    (model_data / "promoted.json").write_text((model_data / "latest.json").read_text())
    changed = client.get(f"/v1/{endpoint}/latest")
    assert changed.json()["modelVersion"] == "v0.2.0"
    assert changed.content == client.get(f"/v1/{endpoint}/latest").content


# 포인터가 없어도 직접 지정한 발행본은 조회할 수 있다.
def test_missing_pointer_and_explicit_version(client: TestClient, model_data: Path) -> None:
    (model_data / "promoted.json").unlink()
    for endpoint in ("model-card", "backtest"):
        assert client.get(f"/v1/{endpoint}/latest").status_code == 404
        assert client.get(f"/v1/{endpoint}/does-not-exist").status_code == 404
    assert client.get("/v1/model-card/v0.2.0").status_code == 200
    assert client.get("/v1/backtest/bt-v0.2.0").status_code == 200


# 깨진 발행본과 포인터의 버전 불일치는 내부 계약 오류다.
def test_invalid_artifacts(client: TestClient, model_data: Path) -> None:
    path = paths.MODELS / "v0.1.0/model_card.json"
    card = json.loads(path.read_text())
    path.write_text(json.dumps({**card, "modelVersion": "v0.2.0"}))
    assert client.get("/v1/model-card/latest").status_code == 500
    path.write_text("{}")
    assert client.get("/v1/model-card/latest").status_code == 500
    (model_data / "promoted.json").write_text("{")
    assert client.get("/v1/backtest/latest").status_code == 500


# staging·G0와 경로 탈출은 자료가 있더라도 조회 대상에서 제외한다.
@pytest.mark.parametrize("name", [".staging-v1", "g0", "../v1", "/tmp", "a/b", ".."])
def test_only_published_folders(api_data: Path, name: str) -> None:
    with pytest.raises(FileNotFoundError):
        published_path(api_data, name)


# 이름이 정상이어도 발행 폴더 밖을 가리키는 링크는 읽지 않는다.
def test_artifact_symlink_escape(api_data: Path) -> None:
    folder = api_data / "models"
    folder.mkdir()
    (folder / "v1").symlink_to(api_data)
    with pytest.raises(FileNotFoundError):
        published_path(folder, "v1")
