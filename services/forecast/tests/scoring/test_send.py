"""가짜 records로 날짜 경계 중단·불확실한 응답·공개 메타의 생성 시점을 검증한다."""

import json
from datetime import datetime
from pathlib import Path

import httpx
import pytest
from crowdcast import paths
from crowdcast.api.assemble.artifacts import Unavailable
from crowdcast.scoring import register, rules
from crowdcast.scoring.select import select_festivals
from scoring_fixtures import inputs, ledger


# 공개 규칙과 두 건의 준비 입력은 실제 레포 밖 테스트 폴더에만 구성한다.
@pytest.fixture
def registration(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> dict:
    batch, events, region = inputs([1, 4])
    selection = select_festivals(batch, events, region)
    monkeypatch.setattr(register, "load_selection", lambda: (batch, selection))
    monkeypatch.setattr(paths, "REPO_ROOT", tmp_path)
    document = tmp_path / rules.RULES_DOC
    document.parent.mkdir(parents=True)
    document.write_text(rules.render_rules(batch.metadata, selection["audit"]), encoding="utf-8")
    return register.prepare(batch, selection)


# GET 중 또는 첫 POST 뒤 자정을 넘으면 그 다음 POST를 보내지 않고 남은 대상을 기록한다.
@pytest.mark.parametrize("rollover", ["GET", "POST"])
def test_midnight_stops_remaining_posts(registration: dict, rollover: str) -> None:
    instant = datetime.fromisoformat("2026-09-29T23:59:59+09:00")
    saved, calls = [], []

    # 가짜 응답을 받는 사이 KST 날짜를 바꿔 처음 검사한 날짜를 재사용할 수 없게 한다.
    def records(request: httpx.Request) -> httpx.Response:
        nonlocal instant
        calls.append(request.method)
        if request.method == rollover:
            instant = datetime.fromisoformat("2026-09-30T00:00:00+09:00")
        if request.method == "GET":
            return httpx.Response(200, json=[])
        saved.append(json.loads(request.content))
        return httpx.Response(200, json=ledger(saved)[-1])

    with httpx.Client(base_url="http://records.test", transport=httpx.MockTransport(records)) as client:
        with pytest.raises(ValueError, match="남은 POST 중단"):
            register.register(send=True, client=client, clock=lambda: instant)
    assert calls == (["GET"] if rollover == "GET" else ["GET", "POST"])
    progress = json.loads((paths.PROCESSED / "prereg_send_status.json").read_bytes())
    expected = [row["forecastId"] for row in registration["payloads"]]
    assert progress["registeredForecastIds"] == expected[:len(saved)]
    assert progress["pendingForecastIds"] == expected[len(saved):]
    assert progress["uncertainForecastIds"] == [] and "남은 POST 중단" in progress["reason"]
    assert not rules.public_meta_path().exists()
    assert list((paths.REPO_ROOT / rules.RULES_DOC).parent.iterdir()) == [paths.REPO_ROOT / rules.RULES_DOC]


# 서버가 저장했는지 모르는 응답 실패는 미전송과 구분하고 전체 성공 메타를 쓰지 않는다.
def test_failed_post_does_not_publish_metadata(registration: dict) -> None:
    calls = []

    # 첫 POST에서 연결 오류를 재현하며 실제 소켓은 열지 않는다.
    def records(request: httpx.Request) -> httpx.Response:
        calls.append(request.method)
        if request.method == "GET":
            return httpx.Response(200, json=[])
        raise httpx.ReadTimeout("응답 시간 초과", request=request)

    with httpx.Client(base_url="http://records.test", transport=httpx.MockTransport(records)) as client:
        with pytest.raises(Unavailable, match="원장 조회"):
            register.register(send=True, client=client,
                              clock=lambda: datetime.fromisoformat("2026-09-29T12:00:00+09:00"))
    expected = [row["forecastId"] for row in registration["payloads"]]
    progress = json.loads((paths.PROCESSED / "prereg_send_status.json").read_bytes())
    assert calls == ["GET", "POST"]
    assert progress["registeredForecastIds"] == []
    assert progress["uncertainForecastIds"] == expected[:1]
    assert progress["pendingForecastIds"] == expected[1:]
    assert not rules.public_meta_path().exists()


# 이미 공개한 메타와 다른 입력은 첫 GET보다 앞에서 거부하고 기존 파일을 보존한다.
def test_changed_public_metadata_stops_send(registration: dict) -> None:
    public = rules.public_meta_path()
    public.write_text("{}", encoding="utf-8")

    # 공개 메타 불일치는 원장 서버에 아무 요청도 보내면 안 된다.
    def no_request(request: httpx.Request) -> httpx.Response:
        raise AssertionError("공개 메타 불일치 뒤 HTTP 호출")

    with httpx.Client(base_url="http://records.test", transport=httpx.MockTransport(no_request)) as client:
        with pytest.raises(ValueError, match="기존 공개 메타"):
            register.register(send=True, client=client,
                              clock=lambda: datetime.fromisoformat("2026-09-29T12:00:00+09:00"))
    assert public.read_text(encoding="utf-8") == "{}"
