"""실제 채점 입구에서 공개 해시·원장 전체 집합·명시적 취소 출처 검증을 확인한다."""

import json
from copy import deepcopy

import httpx
import pytest
from crowdcast import paths
from crowdcast.api.assemble.identity import canonical
from crowdcast.scoring import rules
from crowdcast.scoring.register import prepare
from crowdcast.scoring.score import load_statuses, scores
from crowdcast.scoring.select import select_festivals
from scoring_fixtures import inputs, ledger, write_registered


# 등록 완료 자료만 임시 경로에 구성하며 현재 행사 마스터·최신 배치는 만들지 않는다.
@pytest.fixture
def registered() -> dict:
    batch, events, region = inputs([1, 4])
    preparation = prepare(batch, select_festivals(batch, events, region))
    write_registered(preparation, region)
    return preparation


# 공개 메타 검증 이후에도 서버에서 전체 해시 체인을 읽어 실제 채점 함수를 통과한다.
def score_ledger(entries: list[dict], **kwargs: object) -> dict:
    with httpx.Client(base_url="http://records.test", transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json=entries))) as client:
        return scores(client, **kwargs)


# 임의 JSON 키 순서·공백까지 포함한 파일 전체 변경을 공개 메타 해시가 탐지한다.
@pytest.mark.parametrize("field", ["event", "seed", "samples", "payload", "whitespace"])
def test_changed_preparation_is_rejected(registered: dict, field: str) -> None:
    changed = deepcopy(registered)
    if field == "event":
        next(iter(changed["events"].values()))["hazardFlags"] = ["야간"]
    elif field in {"seed", "samples"}:
        changed["metadata"]["conversion"][field] += 1
    elif field == "payload":
        changed["payloads"][0]["leadDays"] += 1
    raw = canonical(changed) + ("\n\n" if field == "whitespace" else "\n")
    (paths.PROCESSED / "prereg_payloads.json").write_text(raw, encoding="utf-8")
    with pytest.raises(ValueError, match="SHA-256 불일치"):
        score_ledger(ledger(registered["payloads"]))


# 해시가 같아도 공개된 선정 ID·모델·입력 메타와 준비본이 다르면 채점하지 않는다.
@pytest.mark.parametrize("field", ["forecastIds", "eventIds", "modelVersion", "verdict", "runId",
                                   "forecastsSha256"])
def test_public_metadata_fields_are_checked(registered: dict, field: str) -> None:
    file = rules.public_meta_path()
    public = json.loads(file.read_bytes())
    public[field] = [] if field.endswith("Ids") else "changed"
    file.write_text(canonical(public), encoding="utf-8")
    with pytest.raises(ValueError, match="선정 집합·모델 정보 불일치"):
        score_ledger(ledger(registered["payloads"]))


# 빈 원장·정상 접두부·추가 예보 모두 해시 체인이 유효해도 일부 채점을 허용하지 않는다.
@pytest.mark.parametrize("fault", ["empty", "truncated", "extra"])
def test_ledger_set_must_match_public_selection(registered: dict, fault: str) -> None:
    payloads = deepcopy(registered["payloads"])
    if fault == "empty":
        payloads = []
    elif fault == "truncated":
        payloads.pop()
    else:
        extra = deepcopy(payloads[0])
        extra.update(forecastId="f-yeoncheon-yulmu-extra", eventId="e-yeoncheon-yulmu-extra")
        payloads.append(extra)
    with pytest.raises(ValueError, match="forecastId 집합 불일치"):
        score_ledger(ledger(payloads))


# 준비만 된 상태는 원장이 비어 있어도 등록 전 정상 0건 응답으로 위장하지 않는다.
@pytest.mark.parametrize("empty", [False, True])
def test_missing_public_metadata_is_rejected(registered: dict, empty: bool) -> None:
    rules.public_meta_path().unlink()
    with pytest.raises(ValueError, match="공개 메타가 없습니다"):
        score_ledger([] if empty else ledger(registered["payloads"]))


# 상태 파일 부재는 대기이며 취소·연기는 명시한 출처·확인 시각과 함께 별도로 공개한다.
@pytest.mark.parametrize("status", [None, "취소", "연기"])
def test_explicit_status_file_and_sources(registered: dict, status: str | None) -> None:
    expected = []
    if status:
        expected = [{"eventId": registered["payloads"][0]["eventId"], "status": status,
                     "source": "연천군 축제 공지", "checkedAt": "2026-10-08T12:00:00+09:00"}]
        (paths.PROCESSED / "prereg_status.json").write_text(canonical(expected), encoding="utf-8")
    sources: list[dict[str, str]] = []
    result = score_ledger(ledger(registered["payloads"]), status_sources=sources)
    assert result["entries"][0]["status"] == ("취소" if status else "대기")
    assert result["summary"]["cancelled"] == int(status is not None)
    assert result["summary"]["scored"] == 0 and sources == expected


# 출처·시각 누락뿐 아니라 중복·잘못된 형식도 빈 목록으로 삼켜서는 안 된다.
@pytest.mark.parametrize("fault", ["source", "checkedAt", "blank", "naive", "date", "invalid_date",
                                   "status", "duplicate", "object", "null"])
def test_invalid_status_file_fails_scoring(registered: dict, fault: str) -> None:
    row = {"eventId": registered["payloads"][0]["eventId"], "status": "취소",
           "source": "연천군 축제 공지", "checkedAt": "2026-10-08T12:00:00+09:00"}
    if fault in {"source", "checkedAt"}:
        row.pop(fault)
    elif fault == "blank":
        row["source"] = " "
    elif fault in {"naive", "date", "invalid_date"}:
        row["checkedAt"] = {"naive": "2026-10-08T12:00:00", "date": "2026-10-08",
                            "invalid_date": "2026-02-30T12:00:00+09:00"}[fault]
    elif fault == "status":
        row["status"] = "예정"
    elif fault == "null":
        row["source"] = None
    content = row if fault == "object" else [row, row] if fault == "duplicate" else [row]
    (paths.PROCESSED / "prereg_status.json").write_text(canonical(content), encoding="utf-8")
    with pytest.raises(ValueError):
        score_ledger(ledger(registered["payloads"]))


# 파일이 존재하지만 JSON 자체가 깨지면 누락 파일과 달리 오류다.
def test_malformed_status_json(registered: dict) -> None:
    (paths.PROCESSED / "prereg_status.json").write_text("[", encoding="utf-8")
    with pytest.raises(ValueError):
        load_statuses()


# CLI 결과는 계약을 지키는 점수와 별도의 출처 목록을 함께 제공한다.
def test_cli_discloses_status_sources(registered: dict, monkeypatch: pytest.MonkeyPatch,
                                    capsys: pytest.CaptureFixture[str]) -> None:
    from crowdcast.scoring import __main__ as cli

    sources = [{"eventId": registered["payloads"][0]["eventId"], "status": "연기",
                "source": "연천군 축제 공지", "checkedAt": "2026-10-08T12:00:00+09:00"}]
    (paths.PROCESSED / "prereg_status.json").write_text(canonical(sources), encoding="utf-8")
    monkeypatch.setattr(cli, "scores", lambda **kwargs: score_ledger(
        ledger(registered["payloads"]), **kwargs))
    assert cli.main(["score"]) == 0
    output = json.loads(capsys.readouterr().out)
    assert output["statusSources"] == sources and output["scores"]["summary"]["cancelled"] == 1
