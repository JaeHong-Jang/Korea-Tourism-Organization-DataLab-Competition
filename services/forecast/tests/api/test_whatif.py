"""조건 변경의 허용 목록·합성 요청 계약·예측 경로 일치를 확인한다."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient


# 허용된 모든 키는 변경 후 predict를 직접 호출했을 때와 바이트까지 같다.
@pytest.mark.parametrize(
    "changes",
    [
        {},
        {"startsAt": "2025-10-17T19:00:00+09:00"},
        {"endsAt": "2025-10-19T21:00:00+09:00"},
        {"timeOfDay": "주간"},
        {"fee": "유료"},
        {"type": "공연"},
        {"hazards": []},
    ],
)
def test_whatif_matches_predict(client: TestClient, forecast_data: Path, event: dict, changes: dict) -> None:
    response = client.post("/v1/whatif", json={"event": event, "changes": changes})
    direct = client.post("/v1/predict", json={**event, **changes})
    assert response.status_code == 200, response.text
    assert response.content == direct.content
    if changes:
        assert response.json()["id"] != client.post("/v1/predict", json=event).json()["id"]


# 장소·예산·식별자·관측값을 whatif로 바꾸는 요청은 항상 거부한다.
@pytest.mark.parametrize(
    "key",
    ["id", "venue", "budgetKrw", "sigunguCode", "asOf", "observations", "holiday_calendar", "modelVersion"],
)
def test_forbidden_whatif_key(client: TestClient, event: dict, key: str) -> None:
    response = client.post("/v1/whatif", json={"event": event, "changes": {key: None}})
    assert response.status_code == 400


# 키가 허용되어도 계약 타입·열거값·일정 순서가 어긋난 변경은 적용하지 않는다.
@pytest.mark.parametrize(
    "changes", [{"fee": 1}, {"hazards": ["비"]}, {"startsAt": None}, {"endsAt": "2025-10-01T00:00:00Z"}, []]
)
def test_invalid_whatif_changes(client: TestClient, event: dict, changes: object) -> None:
    assert client.post("/v1/whatif", json={"event": event, "changes": changes}).status_code == 400
