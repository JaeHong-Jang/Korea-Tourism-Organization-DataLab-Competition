"""등록 본문 계약·바이트 고정·공개 경로 보호·가짜 records의 날짜 제한을 검증한다."""

import json
from datetime import datetime
from hashlib import sha256
from pathlib import Path

import httpx
import pytest
import yaml
from crowdcast import paths
from crowdcast.api.contract import _validators
from crowdcast.scoring import register, rules
from crowdcast.scoring.__main__ import main
from crowdcast.scoring.select import select_festivals
from scoring_fixtures import inputs, ledger, model_metadata, write_batch

# 계약과 공개 경로는 실제 레포 기준으로 읽고 쓰기는 임시 경로에만 한다.
CONTRACT_ROOT = paths.REPO_ROOT / "packages/contracts"
PUBLIC_RULES = paths.REPO_ROOT / rules.RULES_DOC


# 기록된 규칙 문서 전체를 상수·포함 메타에서 재생성해 한 글자 변경도 잡는다.
def test_public_rules_are_generated() -> None:
    document = PUBLIC_RULES.read_text(encoding="utf-8")
    audit = json.loads(document.split("```json\n", 1)[1].split("\n```", 1)[0])
    assert document == rules.render_rules(audit["metadata"], audit["selection"])
    assert rules.PROMISE in document


# 기본과 명시 dry-run 모두 HTTP 객체를 만들지 않으며 공개 폴더에 payload를 쓰지 않는다.
@pytest.mark.parametrize("arguments", [["register"], ["register", "--dry-run"]])
def test_dry_run_contract_and_identical_bytes(tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
                                            arguments: list[str]) -> None:
    batch, events, region = inputs([4] * 21)
    selection = select_festivals(batch, events, region)
    monkeypatch.setattr(register, "load_selection", lambda: (batch, selection))
    monkeypatch.setattr(paths, "REPO_ROOT", tmp_path)

    # dry-run의 클라이언트 생성 자체를 실패시켜 네트워크 0회를 확인한다.
    def no_client(*args: object, **kwargs: object) -> None:
        raise AssertionError("dry-run HTTP 클라이언트 생성")

    monkeypatch.setattr(httpx, "Client", no_client)
    assert main(arguments) == 0
    file = paths.PROCESSED / "prereg_payloads.json"
    first = file.read_bytes()
    assert main(arguments) == 0 and first == file.read_bytes()
    content = json.loads(first)
    schema = yaml.safe_load((CONTRACT_ROOT / "openapi/records.yaml").read_text())["paths"]["/v1/ledger"][
        "post"]["requestBody"]["content"]["application/json"]["schema"]
    for payload in content["payloads"]:
        _validators()["ledger-entry"].evolve(schema=schema).validate(payload)
        register.validate_payload(payload)
        assert payload["leadDays"] == 10
    assert content["metadata"]["forecastsSha256"] == batch.metadata["forecastsSha256"]
    assert not (tmp_path / "reports/preregistered").exists()


# 변경된 입력으로 재실행해도 기존에 검토한 준비본은 유지한다.
def test_changed_input_does_not_replace_draft() -> None:
    batch, events, region = inputs([4])
    preparation = register.prepare(batch, select_festivals(batch, events, region))
    register.save_preparation(preparation)
    file = paths.PROCESSED / "prereg_payloads.json"
    first = file.read_bytes()
    preparation["payloads"][0]["forecast"]["dailyMeanP50"] += 1
    with pytest.raises(ValueError, match="기존 등록 준비본"):
        register.save_preparation(preparation)
    assert first == file.read_bytes()


# 준비 뒤 마스터가 바뀌면 dry-run·전송 모두 통신 전에 거부하고 준비본을 보존한다.
@pytest.mark.parametrize("send", [False, True])
def test_changed_master_blocks_registration(monkeypatch: pytest.MonkeyPatch, send: bool) -> None:
    batch, events, region = inputs([4])
    write_batch(paths.PROCESSED, batch, events, region)
    monkeypatch.setattr(rules, "model_metadata", model_metadata)

    # 이 회귀 검사는 전송 모드라도 HTTP 클라이언트를 만들기 전에 실패해야 한다.
    def no_client(*args: object, **kwargs: object) -> None:
        raise AssertionError("행사 스냅샷 불일치 뒤 HTTP 클라이언트 생성")

    monkeypatch.setattr(httpx, "Client", no_client)
    register.register()
    file = paths.PROCESSED / "prereg_payloads.json"
    first = file.read_bytes()
    events[0]["hazard_flags"] = ["불꽃"]
    write_batch(paths.PROCESSED, batch, events, region)
    with pytest.raises(ValueError, match="T-205 뒤 행사 마스터가 바뀜 — 일괄 예보를 다시 돌리세요"):
        register.register(send=send, clock=lambda: datetime(2026, 9, 29, tzinfo=rules.KST))
    assert file.read_bytes() == first
    assert not rules.public_meta_path().exists()
    assert not (paths.PROCESSED / "prereg_send_status.json").exists()


# UTC 자정 부근도 KST로 검사하고 전송 금지일에는 자료 읽기와 HTTP보다 먼저 거부한다.
@pytest.mark.parametrize("instant", ["2026-09-28T14:59:59+00:00", "2026-09-29T15:00:00+00:00"])
def test_send_date_guard(instant: str) -> None:
    with pytest.raises(ValueError, match="2026-09-29"):
        register.register(send=True, clock=lambda: datetime.fromisoformat(instant))


# 가짜 records만 호출하며 재시도는 이미 같은 내용으로 등록된 예보를 중복 전송하지 않는다.
def test_send_to_fake_records(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    batch, events, region = inputs([1, 4])
    selection = select_festivals(batch, events, region)
    monkeypatch.setattr(register, "load_selection", lambda: (batch, selection))
    monkeypatch.setattr(paths, "REPO_ROOT", tmp_path)
    document = tmp_path / rules.RULES_DOC
    document.parent.mkdir(parents=True)
    document.write_text(rules.render_rules(batch.metadata, selection["audit"]), encoding="utf-8")
    saved, calls = [], []

    # 기록 저장 없이 응답 본문의 해시 체인만 실제 계약과 같게 생성한다.
    def records(request: httpx.Request) -> httpx.Response:
        calls.append(request.method)
        assert request.url.path == "/v1/ledger"
        if request.method == "GET":
            return httpx.Response(200, json=ledger(saved))
        saved.append(json.loads(request.content))
        return httpx.Response(200, json=ledger(saved)[-1])

    with httpx.Client(base_url="http://records.test", transport=httpx.MockTransport(records)) as client:
        instant = datetime.fromisoformat("2026-09-28T15:00:00+00:00")
        register.register(send=True, client=client, clock=lambda: instant)
        metadata = rules.public_meta_path().read_bytes()
        register.register(send=True, client=client, clock=lambda: instant)
    assert calls == ["GET", "POST", "POST", "GET"]
    assert rules.public_meta_path().read_bytes() == metadata
    assert set(document.parent.iterdir()) == {document, rules.public_meta_path()}
    raw = (paths.PROCESSED / "prereg_payloads.json").read_bytes()
    public = json.loads(metadata)
    assert public["preparationSha256"] == sha256(raw).hexdigest()
    assert public["forecastIds"] == [row["forecastId"] for row in saved]
    assert public["eventIds"] == [row["eventId"] for row in saved]
    assert public["forecastsSha256"] == batch.metadata["forecastsSha256"]
    assert public["runId"] == batch.metadata["runId"]
    assert public["modelVersion"] == batch.metadata["modelVersion"] and public["verdict"] == "미검증"


# 원장 README의 고정 벡터와 같아 PHP·Python 직렬화 차이를 막는다.
def test_ledger_hash_vector_and_tamper() -> None:
    entries = ledger([{"eventId": "e-yeongjong-fireworks-2025", "forecastId": "f-example-yeongjong-2025",
                       "leadDays": 5, "forecast": {"dailyMeanP10": 100, "dailyMeanP50": 200,
                                                   "dailyMeanP90": 300, "level": 2}}])
    assert entries[0]["payloadHash"] == "910112546f85d22fca0491997d1ea3dbf40c01c145341c1aa9c8dd13c61c74c2"
    register.verify_ledger(entries)
    entries[0]["forecast"]["dailyMeanP50"] = 201
    with pytest.raises(ValueError, match="해시 체인"):
        register.verify_ledger(entries)


# 공개 문서 생성 명령도 규칙 파일 하나만 만들고 원장·payload를 쓰지 않는다.
def test_select_writes_only_rules(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from crowdcast.scoring import __main__ as cli

    batch, events, region = inputs([4])
    selection = select_festivals(batch, events, region)
    monkeypatch.setattr(cli, "load_selection", lambda: (batch, selection))
    monkeypatch.setattr(paths, "REPO_ROOT", tmp_path)
    assert cli.main(["select"]) == 0
    document = tmp_path / rules.RULES_DOC
    assert list(document.parent.iterdir()) == [document]
    expected = register.prepare(batch, selection)["metadata"]["rulesSha256"]
    assert sha256(document.read_bytes()).hexdigest() == expected
