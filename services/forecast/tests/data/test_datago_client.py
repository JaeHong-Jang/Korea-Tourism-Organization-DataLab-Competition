"""녹화 응답으로 페이지 순회·캐시·재시도 예산·비밀 비노출을 검증한다."""

import copy
import hashlib
import json
import logging
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx
import pytest
import tenacity
from crowdcast.data.call_ledger import CallLimitReached
from crowdcast.data.datago_client import DataGoError, TransientDataGoError

PARAMS = {"startYmd": "20250901", "endYmd": "20250907"}


# 실제 전체 행 수 5,544에 맞춰 마지막 부분 페이지에서 순회를 끝낸다.
def test_recorded_pagination_and_cache(datago_factory: Callable, tmp_path: Path) -> None:
    client = datago_factory()
    pages = list(client.pages("visitors", PARAMS))
    assert [len(page.items) for page in pages] == [1000] * 5 + [544]
    assert client.ledger.calls == 6
    cached = datago_factory(max_calls=0)
    assert list(cached.pages("visitors", dict(reversed(list(PARAMS.items()))))) == pages
    assert cached.ledger.calls == 0
    hashes = {
        hashlib.sha256(path.read_bytes()).hexdigest()
        for path in (tmp_path / "datago/visitors").glob("*.json")
    }
    assert {page.source_hash for page in pages} == hashes


# 전송 오류의 재시도도 각각 장부에서 차감하고 한도 도달 시 즉시 멈춘다.
def test_failed_attempts_consume_budget(datago_factory: Callable, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tenacity.nap.time, "sleep", lambda _: None)

    # 통신 라이브러리가 URL을 담은 오류를 내도 공통 클라이언트가 숨긴다.
    def timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout(str(request.url), request=request)

    client = datago_factory(max_calls=2, respond=timeout)
    with pytest.raises(CallLimitReached):
        client.page("visitors", PARAMS)
    assert client.ledger.calls == 2
    assert not list((client.cache_dir / "visitors").glob("*.json"))


# 세 번의 재시도를 모두 실패하면 정제된 통신 오류만 노출한다.
def test_retry_exhaustion_hides_url(datago_factory: Callable, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tenacity.nap.time, "sleep", lambda _: None)

    # 에러 원문은 인증키가 포함될 수 있는 실제 라이브러리 동작을 모사한다.
    def timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError(str(request.url), request=request)

    client = datago_factory(respond=timeout)
    with pytest.raises(TransientDataGoError) as exc:
        client.page("visitors", PARAMS)
    assert "fixture-only" not in str(exc.value)
    assert "serviceKey" not in str(exc.value)
    assert client.ledger.calls == 3


# 서버 오류 뒤 성공하면 성공한 응답만 캐시하고 총 두 호출로 기록한다.
def test_transient_server_retry(
    datago_factory: Callable,
    datago_recordings: list[dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(tenacity.nap.time, "sleep", lambda _: None)
    attempts = []

    # 첫 응답만 일시 장애로 바꾸고 두 번째는 녹화 응답을 돌려준다.
    def respond(request: httpx.Request) -> httpx.Response:
        attempts.append(1)
        return (
            httpx.Response(503)
            if len(attempts) == 1
            else httpx.Response(200, json=datago_recordings[0]["payload"])
        )

    client = datago_factory(respond=respond)
    assert client.page("visitors", PARAMS).total_count == 5544
    assert client.ledger.calls == 2


# 인증·서비스 한도·XML 오류는 캐시하지 않고 한 번만 호출한다.
@pytest.mark.parametrize("code", ["22", "23", "30", "xml", "403", "429"])
def test_permanent_errors_are_not_retried(datago_factory: Callable, code: str) -> None:
    # 인증 실패 응답의 자유 문구에 비밀이 있어도 출력하거나 저장하지 않는다.
    def respond(request: httpx.Request) -> httpx.Response:
        if code == "xml":
            return httpx.Response(200, text="<OpenAPI_ServiceResponse>인증 실패</OpenAPI_ServiceResponse>")
        if code in {"403", "429"}:
            return httpx.Response(int(code))
        return httpx.Response(200, json={"response": {"header": {"resultCode": code, "resultMsg": "오류"}}})

    client = datago_factory(respond=respond)
    with pytest.raises(DataGoError):
        client.page("visitors", PARAMS)
    assert client.ledger.calls == 1
    assert not list((client.cache_dir / "visitors").glob("*.json"))


# 키는 전송 파라미터에만 쓰고 응답 캐시·장부·디버그 로그에 남기지 않는다.
def test_key_never_persisted_or_logged(
    datago_factory: Callable,
    datago_recordings: list[dict[str, Any]],
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.DEBUG)

    # URL 인코딩이 한 번만 적용됐는지 전송 계층 안에서 확인한다.
    def respond(request: httpx.Request) -> httpx.Response:
        assert request.url.params["serviceKey"] == "fixture-only-token+/="
        assert request.url.params["MobileOS"] == "ETC"
        assert request.url.params["MobileApp"] == "CrowdCast"
        assert request.url.params["_type"] == "json"
        return httpx.Response(200, json=datago_recordings[0]["payload"])

    client = datago_factory(respond=respond)
    client.page("visitors", PARAMS)
    for path in client.cache_dir.rglob("*"):
        if path.is_file():
            assert "fixture-only" not in path.read_text()
            assert "serviceKey" not in path.read_text()
    assert "fixture-only" not in caplog.text


# 단건 객체와 데이터 없음도 유효한 페이지로 처리한다.
@pytest.mark.parametrize("single", [True, False])
def test_singleton_and_empty_items(
    datago_factory: Callable,
    datago_recordings: list[dict[str, Any]],
    single: bool,
) -> None:
    payload = copy.deepcopy(datago_recordings[0]["payload"])
    body = payload["response"]["body"]
    item = body["items"]["item"][0]
    body.update(totalCount=int(single), items={"item": item} if single else "")
    client = datago_factory(respond=lambda _: httpx.Response(200, json=payload))
    pages = list(client.pages("visitors", PARAMS))
    assert len(pages) == 1 and len(pages[0].items) == int(single)


# 전체 행 수가 남았는데 페이지가 비면 수집 완료로 오인하지 않는다.
def test_truncated_page_rejected(datago_factory: Callable, datago_recordings: list[dict[str, Any]]) -> None:
    payload = copy.deepcopy(datago_recordings[0]["payload"])
    payload["response"]["body"]["items"] = ""
    client = datago_factory(respond=lambda _: httpx.Response(200, json=payload))
    with pytest.raises(DataGoError, match="페이지 형식"):
        list(client.pages("visitors", PARAMS))
    assert not list((client.cache_dir / "visitors").glob("*.json"))


# 손상된 캐시는 새 호출로 덮어쓰지 않고 운영자가 확인할 수 있게 중단한다.
def test_corrupt_cache_rejected(datago_factory: Callable) -> None:
    client = datago_factory()
    client.page("visitors", PARAMS)
    path = next((client.cache_dir / "visitors").glob("*.json"))
    path.write_text(json.dumps({"payload": {}}))
    with pytest.raises(DataGoError):
        client.page("visitors", PARAMS)
    assert client.ledger.calls == 1


# 인증키나 페이지 번호를 일반 파라미터로 넘겨 캐시·예산 규칙을 우회하지 못한다.
@pytest.mark.parametrize("name", ["serviceKey", "ServiceKey", "pageNo", "MobileApp"])
def test_reserved_params_rejected(datago_factory: Callable, name: str) -> None:
    with pytest.raises(ValueError):
        datago_factory().page("visitors", {name: "금지"})


# 실제 미제공 응답의 numOfRows=0은 빈 성공으로 받되 다음 조회를 위해 캐시하지 않는다.
def test_recorded_empty_response_with_zero_page_size(datago_factory: Callable) -> None:
    path = Path(__file__).parent / "fixtures/datago/empty_20260826_20260831.json"
    payload = json.loads(path.read_bytes())["payload"]
    assert payload["response"]["body"]["numOfRows"] == 0
    client = datago_factory(respond=lambda _: httpx.Response(200, json=payload))
    params = {"startYmd": "20260826", "endYmd": "20260831"}
    pages = list(client.pages("visitors", params))
    assert len(pages) == 1 and pages[0].items == [] and pages[0].total_count == 0
    assert not list((client.cache_dir / "visitors").glob("*.json"))
    with pytest.raises(CallLimitReached):
        list(datago_factory(max_calls=0).pages("visitors", params))
    assert client.ledger.calls == 1
