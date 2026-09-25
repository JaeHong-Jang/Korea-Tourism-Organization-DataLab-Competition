"""공식 예제 파싱과 KST 경계·발표별 캐시·근거 보존을 네트워크 없이 검증한다."""

import hashlib
from collections.abc import Callable
from datetime import datetime
from pathlib import Path

import httpx
import pytest
from crowdcast.data.call_ledger import KST
from crowdcast.data.weather import client as weather_module
from crowdcast.data.weather.client import WeatherClient


# 문서의 실황·단기 XML 예제를 변환한 JSON을 그대로 재생한다.
@pytest.mark.parametrize("kind", ["ultra", "short"])
def test_official_grid_sample(weather_factory: Callable, weather_sample: Callable, kind: str) -> None:
    payload = weather_sample(kind)
    client = weather_factory(respond=lambda _: httpx.Response(200, json=payload))
    if kind == "ultra":
        result = client.ultra_now(55, 127, "2021-06-28T06:10:00+09:00")
        assert result["records"][0]["precipitation_mm"] == 1.1
        assert result["records"][0]["estimated"] is False
    else:
        result = client.short_term(55, 127, "2021-06-28T05:00:00+09:00")
        assert result["records"][0]["temperature_c"] == 21
        assert result["records"][0]["valid_at"] == "2021-06-28T06:00:00+09:00"
    assert result["timezone"] == "Asia/Seoul"


# 기본 캐시를 옮겨도 T-101과 동일한 공유 장부를 유지한다.
def test_default_shared_ledger(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(weather_module, "CACHE", tmp_path / "cache")
    with WeatherClient(
        cache_dir=tmp_path / "isolated", transport=httpx.MockTransport(lambda _: None)
    ) as client:
        assert client.ledger.path == tmp_path / "cache/datago/ledger.csv"
    with WeatherClient(transport=httpx.MockTransport(lambda _: None)) as client:
        assert client.cache_dir == tmp_path / "cache/weather"


# 같은 발표 회차의 실황은 분·초가 달라도 캐시를 공유하고 UTC 입력도 KST로 해석한다.
def test_ultra_cache_and_evidence(weather_factory: Callable) -> None:
    client = weather_factory()
    first = client.ultra_now(60, 127, "2026-09-25T15:10:00")
    cached = weather_factory(max_calls=0).ultra_now(60, 127, "2026-09-25T06:59:59Z")
    assert first == cached
    record = first["records"][0]
    assert record["temperature_c"] == 21.5 and record["wind_speed_m_s"] == 2.3
    assert record["precipitation_probability_pct"] is None and record["sky"] is None
    assert record["precipitation_type"] == "없음"
    raw = next((client.cache_dir / "ultra_now").glob("*.json")).read_bytes()
    assert record["evidence"][0]["source_hash"] == hashlib.sha256(raw).hexdigest()
    assert record["available_at"] >= first["fetched_at"]
    assert client.ledger.calls == 1


# 자정 직후 10분 이전에는 전날 23시 회차를 선택한다.
@pytest.mark.parametrize(
    "at,issued",
    [
        ("2026-09-25T00:09:59", "2026-09-24T23:00:00+09:00"),
        ("2026-09-25T00:10:00", "2026-09-25T00:00:00+09:00"),
    ],
)
def test_ultra_publication_boundary(weather_factory: Callable, at: str, issued: str) -> None:
    assert weather_factory().ultra_now(60, 127, at)["issued_at"] == issued


# 좌표·발표일·발표시각·서비스를 바꾸면 별도 캐시와 호출 예산을 쓴다.
def test_distinct_cache_identity(weather_factory: Callable) -> None:
    client = weather_factory()
    result = client.short_term(60, 127, "2026-09-25T05:00:00")
    assert result["records"][0]["precipitation_probability_pct"] == 60
    assert result["records"][0]["sky"] == "흐림"
    assert result["records"][0]["estimated"] is True
    assert client.short_term(60, 127, "2026-09-24T20:00:00Z") == result
    client.short_term(61, 127, "2026-09-25T05:00:00")
    client.short_term(60, 127, "2026-09-25T08:00:00")
    client.short_term(60, 127, "2026-09-26T05:00:00")
    client.ultra_now(60, 127, "2026-09-25T05:10:00")
    assert client.ledger.calls == 5


# 잘못된 정규 발표시각·지역·격자는 예산을 차감하기 전에 실패한다.
@pytest.mark.parametrize(
    "method,args",
    [
        ("short_term", (60, 127, "2026-09-25T06:00:00")),
        ("short_term", (60, 127, "2026-09-25T05:01:00")),
        ("short_term", (60, 127, "잘못된 시각")),
        ("ultra_now", (150, 127, "2026-09-25T05:10:00")),
        ("mid_term", ("11B00000", "2026-09-25T05:00:00")),
        ("mid_term", ("서울", "2026-09-25T06:00:00")),
        ("mid_term", ("../11B00000", "2026-09-25T06:00:00")),
    ],
)
def test_bad_arguments(weather_factory: Callable, method: str, args: tuple) -> None:
    client = weather_factory()
    with pytest.raises(ValueError):
        getattr(client, method)(*args)
    assert client.ledger.calls == 0


# 기온과 육상 구역은 서로 다른 API로 조회하며 미제공 변수를 채우지 않는다.
@pytest.mark.parametrize("temperature", [False, True])
def test_mid_official_sample_and_cache(
    weather_factory: Callable, weather_sample: Callable, temperature: bool
) -> None:
    payload = weather_sample("mid_temperature" if temperature else "mid_land")
    region = payload["response"]["body"]["items"]["item"][0]["regId"]

    # 중기 API에는 격자 파라미터 대신 구역 코드와 KST 발표시각을 전달한다.
    def respond(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("getMidTa" if temperature else "getMidLandFcst")
        assert request.url.params["regId"] == region
        assert request.url.params["tmFc"] == "202609250600"
        assert request.url.params["dataType"] == "JSON"
        assert "nx" not in request.url.params
        return httpx.Response(200, json=payload)

    client = weather_factory(respond=respond)
    result = client.mid_term(region, datetime(2026, 9, 25, 6, tzinfo=KST))
    assert weather_factory(max_calls=0).mid_term(region, "2026-09-24T21:00:00Z") == result
    record = result["records"][0]
    assert record["wind_speed_m_s"] is None and record["temperature_c"] is None
    if temperature:
        assert record["temperature_min_c"] == 20 and record["temperature_max_c"] == 26
        assert record["sky"] is None
    else:
        assert record["precipitation_probability_pct"] == 30 and record["sky"] == "구름많음"
        assert record["valid_at"] == "2026-09-30T00:00:00+09:00"
        assert record["valid_until"] == "2026-09-30T12:00:00+09:00"
        assert result["records"][-1]["period"] == "day"
    assert client.ledger.calls == 1
