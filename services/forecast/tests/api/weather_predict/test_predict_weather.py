"""날씨 추가가 수치·누수·계약·재현성과 우천 점검에 미치는 영향을 HTTP 경로에서 검증한다."""

import json
from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest
from crowdcast.api.assemble.forecast import predict
from crowdcast.api.assemble.identity import canonical
from crowdcast.api.assemble.inputs import cutoff
from crowdcast.api.assemble.model import current_model
from crowdcast.api.assemble.observations import feature_frame
from crowdcast.api.contract import validate
from crowdcast.models.distribution import distribution
from crowdcast.rules.peak import round_people
from fastapi.testclient import TestClient


# 계수 부재에서도 강수·하늘·기온·실제 발표와 수집 시각을 근거로 발행한다.
def test_rain_without_adjustment(
    client: TestClient, forecast_data: Path, event: dict, rain_weather: SimpleNamespace,
) -> None:
    original = predict(event)
    response = client.post("/v1/predict", json=event)
    assert response.status_code == 200, response.text
    result = response.json()
    validate("forecast", result)
    for key in ("dailyMean", "peakConcurrent"):
        assert {k: v for k, v in result[key].items() if k != "id"} == {
            k: v for k, v in original[key].items() if k != "id"
        }
    assert result["probabilities"] == original["probabilities"]
    assert result["observations"] == original["observations"]
    assert result["asOf"] == original["asOf"]
    assert all(item["availableAt"] <= result["asOf"] for item in result["observations"])
    data = next(item for item in result["evidence"] if (item["source"] or {}).get("datasetId")
                == "ds-kma-short-15084084")
    content = json.loads(data["summary"])
    assert data["kind"] == "data"
    assert content["weather"]["pop"] == 70 and content["weather"]["temp"] == 18.5
    assert content["issuedAt"] != content["fetchedAt"]
    assert content["fetchedAt"] == rain_weather.current.isoformat()
    factor = next(item for item in result["factors"] if item["feature"] == "event_weather")
    assert "강수확률 70%·비·흐림·기온 18.5℃" in factor["label"]
    assert data["id"] in factor["evidenceIds"]
    assumption = next(item for item in result["evidence"] if item["assumptionId"] == "as-weather-adjustment")
    assert "날씨 보정 없음" in assumption["summary"] and "표본 부족" in assumption["summary"]
    rain = next(item for item in result["evidence"] if item["ruleId"] == "rule-check-rain-shelter")
    assert '"pop":70' in rain["summary"] and '"pty":"비"' in rain["summary"]
    assert response.content == client.post("/v1/predict", json=event).content
    assert result["id"] != original["id"]


# 표본 하한 양쪽을 만족한 계수는 분위수 전체와 최종 분포·판정에 함께 적용된다.
def test_supported_coefficient(
    client: TestClient, forecast_data: Path, event: dict, rain_weather: SimpleNamespace,
    coefficient: dict, configure,
) -> None:
    configure(coefficient)
    model, _ = current_model()
    quantiles, _, _ = model.infer(feature_frame(event, cutoff(event), model.encoding["features"]))
    expected, judgment = distribution([value * 0.8 for value in quantiles], event,
                                      seed=model.config["seed"], n=model.config["samples"],
                                      basis=model.choice["basis"])
    response = client.post("/v1/predict", json=event)
    assert response.status_code == 200, response.text
    result = response.json()
    for key, value in zip(("p10", "p50", "p90"), quantiles, strict=True):
        assert result["dailyMean"][key] == round_people(value * 0.8)
        assert result["peakConcurrent"][key] == round_people(expected.quantity("q-test")[key])
    assert result["probabilities"] == judgment.probabilities
    assert result["judgment"]["level"] == judgment.judgment["level"]
    assert all("as-weather-adjustment" in result[key]["assumptionIds"]
               for key in ("dailyMean", "peakConcurrent"))
    assert "추정" in result["dailyMean"]["name"] and result["peakConcurrent"]["estimated"]
    proof = next(item for item in result["evidence"] if item["assumptionId"] == "as-weather-adjustment")
    assert "0.8" in proof["summary"] and "5건" in proof["summary"] and "2024-12-31" in proof["summary"]
    explanation = next(item for item in result["evidence"] if item["kind"] == "model")
    assert json.loads(explanation["summary"])["dailyMean"] == result["dailyMean"]
    assert result["observations"] == predict(event)["observations"]


# 행사일이 과거 또는 열흘 밖이면 기존 직렬화 예보와 바이트 단위로 같다.
@pytest.mark.parametrize("delta", [timedelta(microseconds=-1), timedelta(days=10, microseconds=1)])
def test_outside_window_identical(
    client: TestClient, forecast_data: Path, event: dict, rain_weather: SimpleNamespace, delta: timedelta,
) -> None:
    rain_weather.current = rain_weather.target - delta
    expected = canonical(predict(event)).encode()
    response = client.post("/v1/predict", json=event)
    assert response.status_code == 200 and response.content == expected
    assert rain_weather.calls == []


# 경계 날짜의 중기 날씨도 도시 기온과 육상 예보의 원본 계보를 각각 보존한다.
@pytest.mark.parametrize("days", [7, 10])
def test_mid_term_evidence(
    client: TestClient, forecast_data: Path, event: dict, rain_weather: SimpleNamespace, days: int,
) -> None:
    rain_weather.current = rain_weather.target - timedelta(days=days)
    response = client.post("/v1/predict", json=event)
    assert response.status_code == 200, response.text
    items = [item for item in response.json()["evidence"]
             if (item["source"] or {}).get("datasetId") == "ds-kma-mid-15059468"]
    assert len(items) == 2
    records = [json.loads(item["summary"]) for item in items]
    assert {row["product"] for row in records} == {"mid_land", "mid_temperature"}
    assert len({row["fetchedAt"] for row in records}) == 2
    assert all(row["weather"]["temp"] is None and row["weather"]["tempMin"] == 15 for row in records)


# 강수 가능성이 낮고 무강수인 실제 예보에서만 기본 우천 점검이 꺼진다.
@pytest.mark.parametrize("pop,pty,enabled", [(10, "없음", False), (30, "없음", True),
                                          (0, "눈", True), (None, None, True)])
def test_rain_checklist_uses_forecast(
    client: TestClient, forecast_data: Path, event: dict, rain_weather: SimpleNamespace,
    pop: int | None, pty: str | None, enabled: bool,
) -> None:
    rain_weather.pop, rain_weather.pty = pop, pty
    response = client.post("/v1/predict", json=event)
    assert response.status_code == 200, response.text
    rules = {item["ruleId"] for item in response.json()["judgment"]["checklist"]}
    assert ("rule-check-rain-shelter" in rules) is enabled
