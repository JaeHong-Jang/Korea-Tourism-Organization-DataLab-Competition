"""실패 재시도·공유 호출 한도·비밀 비노출과 오류 캐시 차단을 검증한다."""

import json
import logging
import traceback
from collections.abc import Callable
from pathlib import Path
from urllib.parse import quote

import httpx
import pytest
import tenacity
from crowdcast import config
from crowdcast.data import call_ledger
from crowdcast.data.call_ledger import CallLimitReached
from crowdcast.data.datago_client import DataGoError, TransientDataGoError


# 인증·한도·미공개 자료 오류는 재시도하거나 성공 캐시로 남기지 않는다.
@pytest.mark.parametrize("code", ["03", "22", "23", "30", "403", "429", "xml"])
def test_permanent_errors(weather_factory: Callable, code: str) -> None:
    # 각 오류 경로를 키 없는 최소 응답으로 재생한다.
    def respond(request: httpx.Request) -> httpx.Response:
        if code == "xml":
            return httpx.Response(200, text="<OpenAPI_ServiceResponse>인증 실패</OpenAPI_ServiceResponse>")
        if len(code) == 3:
            return httpx.Response(int(code))
        return httpx.Response(200, json={"response": {"header": {"resultCode": code}}})

    client = weather_factory(respond=respond)
    with pytest.raises(DataGoError):
        client.ultra_now(60, 127, "2026-09-25T06:10:00")
    assert client.ledger.calls == 1
    assert not list(client.cache_dir.rglob("*.json"))


# 통신 예외가 요청 URL을 담아도 세 번 뒤 정제된 오류만 사용자에게 전달한다.
def test_timeout_redaction(weather_factory: Callable, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tenacity.nap.time, "sleep", lambda _: None)

    # 실제 httpx의 URL 포함 예외를 흉내 낸다.
    def timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout(str(request.url), request=request)

    client = weather_factory(respond=timeout)
    with pytest.raises(TransientDataGoError) as caught:
        client.ultra_now(60, 127, "2026-09-25T06:10:00")
    assert "weather-fixture" not in "".join(traceback.format_exception(caught.value))
    assert client.ledger.calls == 3
    assert not list(client.cache_dir.rglob("*.json"))


# 재시도마다 실행 예산을 소비하며 예산 소진 뒤 추가 전송하지 않는다.
def test_retry_budget(weather_factory: Callable, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tenacity.nap.time, "sleep", lambda _: None)
    client = weather_factory(max_calls=2, respond=lambda _: httpx.Response(503))
    with pytest.raises(CallLimitReached):
        client.short_term(60, 127, "2026-09-25T05:00:00")
    assert client.ledger.calls == 2


# 일시 서버·서비스 장애 뒤 성공한 응답만 저장한다.
@pytest.mark.parametrize("code", ["503", "01", "05"])
def test_retry_then_success(
    weather_factory: Callable, weather_sample: Callable, monkeypatch: pytest.MonkeyPatch, code: str
) -> None:
    monkeypatch.setattr(tenacity.nap.time, "sleep", lambda _: None)
    attempts = []

    # 첫 전송만 실패시키고 이후 공식 실황 예제를 돌려준다.
    def respond(request: httpx.Request) -> httpx.Response:
        attempts.append(request)
        if len(attempts) > 1:
            return httpx.Response(200, json=weather_sample("ultra"))
        if code == "503":
            return httpx.Response(503)
        return httpx.Response(200, json={"response": {"header": {"resultCode": code}}})

    client = weather_factory(respond=respond)
    assert client.ultra_now(55, 127, "2021-06-28T06:10:00")["records"]
    assert client.ledger.calls == 2


# 날씨와 T-101의 관광 요청이 같은 날짜의 합계 한도를 공유한다.
def test_shared_daily_limit(
    datago_factory: Callable, weather_factory: Callable, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(call_ledger, "DAILY_LIMIT", 2)
    datago_factory().page("visitors", {"startYmd": "20250901", "endYmd": "20250907"})
    client = weather_factory()
    first = client.ultra_now(60, 127, "2026-09-25T06:10:00")
    assert weather_factory(max_calls=0).ultra_now(60, 127, "2026-09-25T06:10:00") == first
    with pytest.raises(CallLimitReached):
        weather_factory().ultra_now(61, 127, "2026-09-25T06:10:00")


# .env 키가 없으면 환경 변수로 대체하거나 호출 장부를 차감하지 않는다.
def test_missing_key(weather_factory: Callable, monkeypatch: pytest.MonkeyPatch) -> None:
    client = weather_factory()
    config.ENV_FILE.write_text("", encoding="utf-8")
    config.get_settings.cache_clear()
    monkeypatch.setenv("DATA_GO_KR_KEY", "environment-must-not-be-used")
    with pytest.raises(DataGoError, match="DATA_GO_KR_KEY"):
        client.ultra_now(60, 127, "2026-09-25T06:10:00")
    assert client.ledger.calls == 0


# 원문·인코딩·JSON 이스케이프의 반사된 키를 모두 영구 저장에서 제외한다.
@pytest.mark.parametrize("encoding", ["plain", "url", "unicode"])
def test_reflected_secret(weather_factory: Callable, weather_sample: Callable, encoding: str) -> None:
    payload = weather_sample("ultra")
    secret = "weather-fixture-token+/="
    payload["response"]["header"]["resultMsg"] = quote(secret, safe="") if encoding == "url" else secret
    text = json.dumps(payload)
    if encoding == "unicode":
        text = text.replace("weather", "\\u0077eather")
    client = weather_factory(respond=lambda _: httpx.Response(200, text=text))
    with pytest.raises(DataGoError, match="인증 정보"):
        client.ultra_now(55, 127, "2021-06-28T06:10:00")
    assert not list(client.cache_dir.rglob("*.json"))


# 성공 요청의 키는 한 번만 디코딩하고 캐시·장부·디버그 로그에 기록하지 않는다.
def test_secret_not_logged(
    weather_factory: Callable, weather_sample: Callable, tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    config.ENV_FILE.write_text("DATA_GO_KR_KEY=weather-fixture-token%2B%2F%3D\n", encoding="utf-8")
    config.get_settings.cache_clear()
    requests = []

    # 기상청 JSON 파라미터와 전송 중에만 존재하는 키를 확인한다.
    def respond(request: httpx.Request) -> httpx.Response:
        assert request.url.params["serviceKey"] == "weather-fixture-token+/="
        assert request.url.params["dataType"] == "JSON"
        assert "MobileOS" not in request.url.params and "_type" not in request.url.params
        requests.append(request)
        return httpx.Response(200, json=weather_sample("ultra"))

    client = weather_factory(respond=respond)
    client.ultra_now(55, 127, "2021-06-28T06:10:00")
    assert "serviceKey" not in str(requests[0].url)
    assert "weather-fixture" not in caplog.text
    for folder in (tmp_path / "weather", tmp_path / "datago"):
        for path in folder.rglob("*"):
            if path.is_file():
                assert "weather-fixture" not in path.read_text()
                assert "serviceKey" not in path.read_text()
