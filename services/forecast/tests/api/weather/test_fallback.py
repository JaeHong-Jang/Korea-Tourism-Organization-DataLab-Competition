"""한도·통신·캐시 손상 때 최신 캐시 또는 null 응답과 키 비노출을 검증한다."""

import json
import logging
from datetime import timedelta
from types import SimpleNamespace

import pytest
from crowdcast import config
from crowdcast.api.contract import validate
from crowdcast.data import call_ledger


# 같은 위치·발표는 실행 예산이 없어도 캐시만 읽고 호출 장부를 늘리지 않는다.
def test_exact_cache_first(weather_api: SimpleNamespace) -> None:
    query = {"lat": 37.57, "lng": 126.98, "at": weather_api.current.isoformat()}
    first = weather_api.http.get("/v1/weather", params=query).json()
    weather_api.kma.ledger.max_calls = 0
    query["lat"] = 37.571
    second = weather_api.http.get("/v1/weather", params=query).json()
    assert second == {**first, "lat": 37.571}
    assert len(weather_api.calls) == 1


# 실황·단기·중기 모두 같은 위치의 오래된 수집시각을 그대로 보여 준다.
@pytest.mark.parametrize("days", [0, 1, 6])
@pytest.mark.parametrize("failure", ["quota", "timeout", "http429", "no_key"])
@pytest.mark.parametrize("seed", [False, True])
def test_offline_response(
    weather_api: SimpleNamespace, monkeypatch: pytest.MonkeyPatch, days: int, failure: str, seed: bool
) -> None:
    target = weather_api.current + timedelta(days=days)
    query = {"lat": 37.57, "lng": 126.98, "at": target.isoformat()}
    first = weather_api.http.get("/v1/weather", params=query).json() if seed else None
    weather_api.current += timedelta(hours=12)
    if days == 0:
        query["at"] = weather_api.current.isoformat()
    original_calls = len(weather_api.calls)
    if failure == "quota":
        monkeypatch.setattr(call_ledger, "DAILY_LIMIT", weather_api.kma.ledger.calls)
    elif failure == "no_key":
        config.ENV_FILE.write_text("")
        config.get_settings.cache_clear()
    else:
        weather_api.mode = failure
    response = weather_api.http.get("/v1/weather", params=query)
    assert response.status_code == 200
    data = response.json()
    validate("weather", data)
    if seed:
        assert data == {**first, "at": query["at"]}
    else:
        assert data["source"] == "없음"
        assert all(data[key] is None for key in ("temp", "pop", "sky", "pty", "fetchedAt"))
    if failure in {"quota", "no_key"}:
        assert len(weather_api.calls) == original_calls


# 다른 격자의 가장 최근 캐시를 현재 행사장의 날씨로 오인하지 않는다.
def test_other_grid_excluded(weather_api: SimpleNamespace) -> None:
    query = {"lat": 37.57, "lng": 126.98, "at": weather_api.current.isoformat()}
    weather_api.http.get("/v1/weather", params=query)
    weather_api.kma.ledger.max_calls = 0
    query.update(lat=35.18, lng=129.07)
    assert weather_api.http.get("/v1/weather", params=query).json()["source"] == "없음"


# 최신 캐시가 손상돼도 한 단계 전의 유효한 자료를 찾고 전체가 손상되면 null로 응답한다.
def test_corrupt_newest_cache(weather_api: SimpleNamespace) -> None:
    first = weather_api.http.get(
        "/v1/weather", params={"lat": 37.57, "lng": 126.98, "at": weather_api.current.isoformat()}
    ).json()
    weather_api.current += timedelta(hours=1)
    weather_api.http.get(
        "/v1/weather", params={"lat": 37.57, "lng": 126.98, "at": weather_api.current.isoformat()}
    )
    files = sorted(
        weather_api.kma.cache_dir.rglob("*.json"),
        key=lambda path: json.loads(path.read_bytes())["fetched_at"],
    )
    files[-1].write_text("broken")
    weather_api.current += timedelta(hours=1)
    weather_api.kma.ledger.max_calls = 0
    query = {"lat": 37.57, "lng": 126.98, "at": weather_api.current.isoformat()}
    recovered = weather_api.http.get("/v1/weather", params=query).json()
    assert recovered["fetchedAt"] == first["fetchedAt"]
    files[0].write_text("broken")
    assert weather_api.http.get("/v1/weather", params=query).json()["source"] == "없음"


# 여러 이전 발표가 유효하면 파일 이름·mtime 대신 최신 fetchedAt을 선택한다.
def test_latest_fetched_at(weather_api: SimpleNamespace) -> None:
    latest = None
    for _ in range(2):
        latest = weather_api.http.get(
            "/v1/weather", params={"lat": 37.57, "lng": 126.98, "at": weather_api.current.isoformat()}
        ).json()
        weather_api.current += timedelta(hours=1)
    weather_api.kma.ledger.max_calls = 0
    result = weather_api.http.get(
        "/v1/weather", params={"lat": 37.57, "lng": 126.98, "at": weather_api.current.isoformat()}
    ).json()
    assert result["fetchedAt"] == latest["fetchedAt"]


# T-105가 남긴 params 없는 이전 캐시도 발표 해시를 확인한 후 재사용한다.
@pytest.mark.parametrize("days", [0, 1, 6])
def test_legacy_cache(weather_api: SimpleNamespace, days: int) -> None:
    query = {"lat": 37.57, "lng": 126.98, "at": (weather_api.current + timedelta(days=days)).isoformat()}
    first = weather_api.http.get("/v1/weather", params=query).json()
    for path in weather_api.kma.cache_dir.rglob("*.json"):
        payload = json.loads(path.read_bytes())
        del payload["params"]
        path.write_text(json.dumps(payload))
    weather_api.current += timedelta(hours=12)
    weather_api.kma.ledger.max_calls = 0
    if days == 0:
        query["at"] = weather_api.current.isoformat()
    result = weather_api.http.get("/v1/weather", params=query).json()
    assert result == {**first, "at": query["at"]}


# 도시 기온 호출이 실패해도 성공한 광역 하늘·강수 예보는 유지한다.
def test_partial_mid_failure(weather_api: SimpleNamespace) -> None:
    weather_api.mode = "temperature_error"
    response = weather_api.http.get(
        "/v1/weather",
        params={"lat": 37.57, "lng": 126.98, "at": (weather_api.current + timedelta(days=6)).isoformat()},
    )
    assert response.json()["source"] == "중기예보"
    assert response.json()["pop"] == 40
    assert response.json()["temp"] is None


# URL 포함 예외와 키 반사 응답을 HTTP·로그·캐시·장부 어디에도 노출하지 않는다.
@pytest.mark.parametrize("mode", ["ok", "timeout", "reflected", "http429"])
def test_key_redaction(weather_api: SimpleNamespace, caplog: pytest.LogCaptureFixture, mode: str) -> None:
    caplog.set_level(logging.DEBUG)
    weather_api.mode = mode
    response = weather_api.http.get(
        "/v1/weather", params={"lat": 37.57, "lng": 126.98, "at": weather_api.current.isoformat()}
    )
    assert response.status_code == 200
    assert "weather-api-fixture-token" not in response.text + caplog.text
    assert all("serviceKey" not in str(request.url) for request in weather_api.calls)
    for root in (weather_api.kma.cache_dir, weather_api.kma.ledger.path):
        for path in root.rglob("*") if root.is_dir() else [root]:
            if path.is_file():
                assert "weather-api-fixture-token" not in path.read_text()
