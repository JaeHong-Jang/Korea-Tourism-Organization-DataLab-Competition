"""이번 완료 표식이 가리키는 백테스트만 판정하고 결정적 runId 재실행을 허용한다."""

import json
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from crowdcast import paths
from crowdcast.data.call_ledger import KST
from crowdcast.pipeline import __main__ as cli
from crowdcast.pipeline import gates, run_record, stages
from pipeline_fixtures import backtest, latest_record, write_backtest


# 같은 입력의 같은 runId를 다시 써도 이번 완료 표식이 갱신되면 통과해야 한다.
def test_same_run_id_rerun_passes(pipeline_root: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    summary = write_backtest()
    content = summary.read_bytes()

    # 다른 실행 디렉터리가 함께 있어도 완료 표식이 가리키는 결과만 선택한다.
    def command(*args: object) -> tuple[int, str]:
        unrelated = paths.REPORTS / "backtest/unrelated/backtest.json"
        unrelated.parent.mkdir(exist_ok=True)
        unrelated.write_text(json.dumps(backtest()))
        write_backtest()
        return 0, ""

    # 두 차례 모두 같은 결과 바이트와 선택 산출물을 보존하는지 확인한다.
    monkeypatch.setattr(stages, "missing_entrypoint", lambda stage: None)
    monkeypatch.setattr(stages, "command", command)
    for _ in range(2):
        assert cli.main(["--from", "backtest", "--to", "backtest"]) == 0
        record = latest_record(pipeline_root)
        assert record["stages"][4]["artifacts"] == run_record.artifacts(
            [summary.parent / name for name in stages.BACKTEST_FILES]
        )
        assert summary.read_bytes() == content
    assert stages.output_files("backtest") == []


# 새 디렉터리 생성이나 결과 덮어쓰기로 오래된 완료 표식을 대체할 수 없다.
@pytest.mark.parametrize("change", ["none", "summary", "new_directory", "missing_pointer"])
def test_unchanged_pointer_fails(pipeline_root: Path, monkeypatch: pytest.MonkeyPatch, change: str) -> None:
    summary = write_backtest()
    pointer = summary.parent.parent / "latest.json"
    latest = json.loads(pointer.read_bytes())
    latest["finishedAt"] = (datetime.now(KST) - timedelta(days=1)).isoformat()
    pointer.write_text(json.dumps(latest))

    # 정상 종료를 반환하면서 완료 표식만 갱신하지 않는 모듈을 재현한다.
    def command(*args: object) -> tuple[int, str]:
        if change == "summary":
            summary.write_text(json.dumps(backtest()))
        elif change == "new_directory":
            directory = summary.parent.parent / "new-run"
            directory.mkdir()
            (directory / "backtest.json").write_text(json.dumps(backtest()))
        elif change == "missing_pointer":
            pointer.unlink()
        return 0, ""

    # 게이트가 실패하면 일괄 예보를 실행하지 않고 산출물도 현재 실행에 붙이지 않는다.
    monkeypatch.setattr(stages, "missing_entrypoint", lambda stage: None)
    monkeypatch.setattr(stages, "command", command)
    assert cli.main(["--from", "backtest", "--to", "batch"]) == 1
    record = latest_record(pipeline_root)
    assert record["stages"][4]["artifacts"] == []
    assert record["stages"][5]["status"] == "pending"


# 완료 시각 경계는 포함하며 과거 시각·시간대 누락·결과 불일치는 거부한다.
@pytest.mark.parametrize("invalid", [None, "old", "naive", "runId", "modelVersion", "summary", "path"])
def test_completion_pointer_validation(pipeline_root: Path, invalid: str | None) -> None:
    summary = write_backtest()
    pointer = summary.parent.parent / "latest.json"
    latest = json.loads(pointer.read_bytes())
    latest["finishedAt"] = "2026-09-25T09:00:00+09:00"
    started_ns = int(datetime.fromisoformat(latest["finishedAt"]).timestamp()) * 1_000_000_000
    if invalid in {"old", "naive"}:
        latest["finishedAt"] = "2026-09-25T08:59:59+09:00" if invalid == "old" else "2026-09-25T09:00:00"
    elif invalid == "modelVersion":
        latest["modelVersion"] = "2024"
    elif invalid == "runId":
        current = backtest()
        current["runId"] = "wrong-run"
        summary.write_text(json.dumps(current))
    elif invalid == "summary":
        summary.unlink()
    elif invalid == "path":
        latest["runId"] = "../outside"
    pointer.write_text(json.dumps(latest))
    if invalid:
        with pytest.raises(ValueError):
            run_record.current_backtest(started_ns)
    else:
        assert run_record.current_backtest(started_ns) == summary.parent


# 골든 사례가 없으면 첫 실행·직전 비교 모두 미검증이며 publish도 통과할 수 없다.
@pytest.mark.parametrize("previous", [None, backtest()])
def test_empty_golden_unverified(pipeline_root: Path, previous: dict | None) -> None:
    current = backtest()
    current["golden"] = []
    path = write_backtest(current)
    gate = gates.optional_gate("backtest", [path], previous)
    assert gate["passed"] is None and "미검증" in gate["message"]
    record = run_record.new_record(stages.STAGES, stages.STAGES, False)
    for stage in record["stages"][:-1]:
        stage.update(status="passed", gate={"passed": True, "message": "검증 통과"})
    record["stages"][4]["gate"] = gate
    assert cli.publish_gate(record, False)["passed"] is None


# 골든 미검증이라도 이번에 만든 결과 파일 해시는 보존하고 전체 미완료를 알린다.
def test_unverified_backtest_records_artifact(pipeline_root: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    def command(*args: object) -> tuple[int, str]:
        current = backtest()
        current["golden"] = []
        write_backtest(current)
        return 0, ""

    # 산출물이 생긴 미검증 단계와 모듈이 없는 단계를 기록에서 구별한다.
    monkeypatch.setattr(stages, "missing_entrypoint", lambda stage: None)
    monkeypatch.setattr(stages, "command", command)
    assert cli.main(["--from", "backtest", "--to", "backtest"]) == 2
    record = latest_record(pipeline_root)
    assert record["stages"][4]["status"] == "skipped"
    # 바뀌는 포인터 파일은 빼고 실행 폴더의 세 산출물만 기록한다.
    assert len(record["stages"][4]["artifacts"]) == len(stages.BACKTEST_FILES)
    assert "미검증 단계: backtest" in record["summary"]


# 옛 latest.json에 미래 finishedAt이 남아 있어도 이번 단계가 파일을 새로 쓰지 않았으면 실패한다.
def test_stale_pointer_with_future_finish_fails(pipeline_root: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    import os

    summary = write_backtest()
    pointer = summary.parent.parent / "latest.json"
    latest = json.loads(pointer.read_bytes())
    latest["finishedAt"] = (datetime.now(KST) + timedelta(days=1)).isoformat()
    pointer.write_text(json.dumps(latest))
    old = pointer.stat().st_mtime_ns - 10**12
    os.utime(pointer, ns=(old, old))

    # 정상 종료만 돌려주고 아무 파일도 쓰지 않는 모듈을 재현한다.
    monkeypatch.setattr(stages, "missing_entrypoint", lambda stage: None)
    monkeypatch.setattr(stages, "command", lambda *args: (0, ""))
    assert cli.main(["--from", "backtest", "--to", "backtest"]) == 1
    record = latest_record(pipeline_root)
    assert record["stages"][4]["status"] == "failed"
    assert "latest.json" in record["stages"][4]["gate"]["message"]


# 실행 직전에 쓰인 옛 표식(미래 finishedAt)이라도 이번 단계에서 내용이 바뀌지 않으면 실패한다.
def test_recent_unchanged_pointer_fails(pipeline_root: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    summary = write_backtest()
    pointer = summary.parent.parent / "latest.json"
    latest = json.loads(pointer.read_bytes())
    latest["finishedAt"] = (datetime.now(KST) + timedelta(days=1)).isoformat()
    pointer.write_text(json.dumps(latest))
    monkeypatch.setattr(stages, "missing_entrypoint", lambda stage: None)
    monkeypatch.setattr(stages, "command", lambda *args: (0, ""))
    assert cli.main(["--from", "backtest", "--to", "backtest"]) == 1
    assert "latest.json" in latest_record(pipeline_root)["stages"][4]["gate"]["message"]
