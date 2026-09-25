"""날씨나 계수의 결측·장애가 기존 예보를 깨거나 임의 보정으로 이어지지 않게 한다."""

from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest
from crowdcast.api.assemble import weather_lookup
from crowdcast.api.assemble.forecast import predict
from crowdcast.api.assemble.identity import canonical
from crowdcast.api.assemble.weather_lookup import REQUEST_WEATHER
from crowdcast.data.datago_client import DataGoError
from crowdcast.data.weather import service
from crowdcast.data.weather.client import WeatherClient
from fastapi.testclient import TestClient


# 어느 한 집단이라도 표본이 부족하거나 계수·기간·출처가 잘못되면 수치를 유지한다.
@pytest.mark.parametrize("change", [{"sample_count": 2}, {"dry_sample_count": 2},
                                   {"period_to": "2099-01-01"}, {"multiplier": 0.1}, {"source": ""}])
def test_invalid_coefficient_is_not_applied(
    client: TestClient, forecast_data: Path, event: dict, rain_weather: SimpleNamespace,
    coefficient: dict, configure, change: dict,
) -> None:
    original = predict(event)
    configure({**coefficient, **change})
    response = client.post("/v1/predict", json=event)
    assert response.status_code == 200, response.text
    result = response.json()
    for name in ("dailyMean", "peakConcurrent"):
        assert [result[name][key] for key in ("p10", "p50", "p90")] == [
            original[name][key] for key in ("p10", "p50", "p90")
        ]
    assert any("날씨 보정 없음" in item["summary"] for item in result["evidence"])


# 비어 있는 파일도 임의 기본 배수 없이 보정 없음 근거를 남긴다.
def test_empty_config(
    client: TestClient, forecast_data: Path, event: dict, rain_weather: SimpleNamespace,
) -> None:
    rain_weather.config.write_text("")
    response = client.post("/v1/predict", json=event)
    assert response.status_code == 200, response.text
    assert any("날씨 보정 없음" in item["summary"] for item in response.json()["evidence"])


# 날씨 조회 장애는 기존 응답 바이트로 돌아가며 요청별 활성 상태도 남기지 않는다.
@pytest.mark.parametrize("failure", [DataGoError("가짜 통신 실패"), OSError("가짜 캐시 실패")])
def test_weather_failure(
    client: TestClient, forecast_data: Path, event: dict, rain_weather: SimpleNamespace,
    monkeypatch: pytest.MonkeyPatch, failure: Exception,
) -> None:
    expected = canonical(predict(event)).encode()

    # 외부 서비스의 예외만 주입하고 API·모델·판정 경로는 실제 코드를 실행한다.
    def fail(*args: object, **kwargs: object) -> None:
        raise failure

    monkeypatch.setattr(service, "weather", fail)
    response = client.post("/v1/predict", json=event)
    assert response.status_code == 200 and response.content == expected
    assert not REQUEST_WEATHER.get()
    assert canonical(predict(event)).encode() == expected


# 재예보마다 달라진 날씨는 새 예보 식별자로 저장되어 이전 응답과 충돌하지 않는다.
def test_changed_weather_has_new_identity(
    client: TestClient, forecast_data: Path, event: dict, rain_weather: SimpleNamespace,
) -> None:
    first = client.post("/v1/predict", json=event).json()
    rain_weather.pop = 80
    second = client.post("/v1/predict", json=event).json()
    assert first["id"] != second["id"]
    assert first["observations"] == second["observations"]


# 성공했던 단기 캐시라도 다른 날짜의 자료만 남아 있으면 날씨로 발행하지 않는다.
def test_wrong_day_snapshot_is_not_used(
    client: TestClient, forecast_data: Path, event: dict, rain_weather: SimpleNamespace,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original = WeatherClient._grid

    # 단기 선택기가 가까운 자료로 고를 수 있는 오래된 예보를 재현한다.
    def expired(*args: object, **kwargs: object) -> dict:
        snapshot = original(*args, **kwargs)
        snapshot["records"][0]["valid_at"] = (rain_weather.target - timedelta(days=1)).isoformat()
        return snapshot

    monkeypatch.setattr(WeatherClient, "_grid", expired)
    expected = canonical(predict(event)).encode()
    response = client.post("/v1/predict", json=event)
    assert response.status_code == 200 and response.content == expected


# 장애 대체 시 현재 회차를 지어내지 않고 실제 이전 캐시의 발표·수집 시각을 인용한다.
def test_cached_weather_keeps_original_issue(
    client: TestClient, forecast_data: Path, event: dict, rain_weather: SimpleNamespace,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import json

    issued = rain_weather.current.replace(hour=14) - timedelta(days=1)
    with WeatherClient() as source:
        cached = source._grid("short_term", 55, 124, issued)

    # 원본 캐시의 검증은 기존 서비스 테스트가 맡고 여기서는 선택된 계보 연결을 확인한다.
    def fail(*args: object, **kwargs: object) -> None:
        raise DataGoError("가짜 통신 실패")

    monkeypatch.setattr(WeatherClient, "_grid", fail)
    monkeypatch.setattr(weather_lookup, "cached_results", lambda *args: [cached])
    response = client.post("/v1/predict", json=event)
    assert response.status_code == 200, response.text
    evidence = next(item for item in response.json()["evidence"]
                    if (item["source"] or {}).get("datasetId") == "ds-kma-short-15084084")
    assert json.loads(evidence["summary"])["issuedAt"] == issued.isoformat()


# 계수가 등록되어 있어도 무강수 예보에는 적용하지 않으며 표본 부재라고 잘못 설명하지 않는다.
def test_dry_forecast_does_not_apply_rain_coefficient(
    client: TestClient, forecast_data: Path, event: dict, rain_weather: SimpleNamespace,
    coefficient: dict, configure,
) -> None:
    configure(coefficient)
    rain_weather.pop, rain_weather.pty = 0, "없음"
    original = predict(event)
    response = client.post("/v1/predict", json=event)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["dailyMean"]["p50"] == original["dailyMean"]["p50"]
    note = next(item["summary"] for item in result["evidence"]
                if item["assumptionId"] == "as-weather-adjustment")
    assert "무강수 예보" in note and "ASOS 일자료 미보유" not in note
