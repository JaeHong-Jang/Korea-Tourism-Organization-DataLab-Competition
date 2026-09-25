"""날씨 발표 경계와 중기 광역·도시 코드의 행정구역 대응을 검증한다."""

from collections.abc import Callable
from datetime import datetime
from pathlib import Path

import httpx
import pytest
from crowdcast.api.contract import validate
from crowdcast.data.weather import regions, service
from crowdcast.data.weather.client import WeatherClient
from crowdcast.data.weather.normalize import as_kst
from crowdcast.data.weather.regions import region_codes
from crowdcast.data.weather.service import latest_base


# 단기 발표 지연 10분 전후와 자정의 전날 회차를 확인한다.
@pytest.mark.parametrize(
    "current,expected",
    [
        ("2026-09-25T02:09:59+09:00", "2026-09-24T23:00:00+09:00"),
        ("2026-09-25T02:10:00+09:00", "2026-09-25T02:00:00+09:00"),
        ("2026-09-25T00:00:00+09:00", "2026-09-24T23:00:00+09:00"),
        ("2026-09-25T23:10:00+09:00", "2026-09-25T23:00:00+09:00"),
    ],
)
def test_short_base(current: str, expected: str) -> None:
    assert latest_base(as_kst(current), (2, 5, 8, 11, 14, 17, 20, 23), 10) == datetime.fromisoformat(expected)


# 중기 06·18시 발표와 전날 마지막 발표 선택을 확인한다.
@pytest.mark.parametrize(
    "current,expected",
    [
        ("2026-09-25T05:59:59+09:00", "2026-09-24T18:00:00+09:00"),
        ("2026-09-25T06:00:00+09:00", "2026-09-25T06:00:00+09:00"),
        ("2026-09-25T18:00:00+09:00", "2026-09-25T18:00:00+09:00"),
    ],
)
def test_mid_base(current: str, expected: str) -> None:
    assert latest_base(as_kst(current), (6, 18)) == datetime.fromisoformat(expected)


# 실제 시군구명으로 동명이인과 영서·영동·제주 도시 구분을 검사한다.
@pytest.mark.parametrize(
    "code,name,land,city",
    [
        ("11110", "종로구", "11B00000", "11B10101"),
        ("28110", "중구", "11B00000", "11B20201"),
        ("28710", "강화군", "11B00000", "11B20101"),
        ("41111", "수원시 장안구", "11B00000", "11B20601"),
        ("41610", "광주시", "11B00000", "11B20702"),
        ("29110", "동구", "11F20000", "11F20501"),
        ("51150", "강릉시", "11D20000", "11D20501"),
        ("51110", "춘천시", "11D10000", "11D10301"),
        ("51820", "고성군", "11D20000", "11D20402"),
        ("48820", "고성군", "11H20000", "11H20404"),
        ("26110", "중구", "11H20000", "11H20201"),
        ("50110", "제주시", "11G00000", "11G00201"),
        ("50130", "서귀포시", "11G00000", "11G00401"),
        ("52130", "군산시", "11F10000", "21F10501"),
        ("36110", "세종시", "11C20000", "11C20404"),
        ("47940", "울릉군", "11H10000", None),
    ],
)
def test_region_codes(code: str, name: str, land: str, city: str | None) -> None:
    assert region_codes(code, name) == (land, city)


# 경계 원본·공간 확장이 없을 때 임의의 대표 도시를 고르지 않는다.
@pytest.mark.parametrize("error", [FileNotFoundError(), RuntimeError("공간 확장 없음")])
def test_missing_boundaries(monkeypatch: pytest.MonkeyPatch, error: Exception) -> None:
    # 운영 파일을 읽지 않고 로컬 자원 누락만 재현한다.
    def missing() -> None:
        raise error

    monkeypatch.setattr(regions, "weather_gazetteer", missing)
    assert regions.weather_regions(37.57, 126.98) is None


# 실 API 경로의 타임아웃은 단 한 번만 전송한 뒤 캐시 없는 정상 응답으로 돌아온다.
def test_http_weather_timeout_budget(
    weather_factory: Callable, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    weather_factory()
    requests = []
    clients = []
    current = as_kst("2026-09-25T09:30:00+09:00")

    # 전송 계층에 실제 전달되는 타임아웃과 키가 제거된 요청 객체를 확인한다.
    def timeout(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        raise httpx.ConnectTimeout(str(request.url), request=request)

    # 서비스가 지정한 옵션을 그대로 실제 클라이언트 생성자에 전달한다.
    def create(**options: object) -> WeatherClient:
        client = WeatherClient(
            cache_dir=tmp_path / "http-weather",
            ledger_path=tmp_path / "ledger.csv",
            transport=httpx.MockTransport(timeout),
            **options,
        )
        clients.append(client)
        return client

    monkeypatch.setattr(service, "WeatherClient", create)
    monkeypatch.setattr(service, "now", lambda: current)
    result = service.weather(37.57, 126.98, current)
    assert result["source"] == "없음"
    assert len(requests) == clients[0].ledger.calls == 1
    assert all(value <= 1 for value in requests[0].extensions["timeout"].values())
    assert "serviceKey" not in str(requests[0].url)
    validate("weather", result)
