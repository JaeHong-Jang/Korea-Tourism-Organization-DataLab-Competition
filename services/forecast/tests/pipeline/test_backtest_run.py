"""이번 단계의 단일 백테스트 결과만 판정·해시하고 골든 미검증 승격을 차단한다."""

import json
from pathlib import Path

import pytest
from crowdcast import paths
from crowdcast.pipeline import __main__ as cli
from crowdcast.pipeline import gates, run_record, stages
from pipeline_fixtures import backtest, latest_record


# 성공 종료만으로 기존 결과를 재사용하거나 여러 새 실행 중 하나를 고르지 않는다.
@pytest.mark.parametrize("created", [0, 1, 2])
def test_only_one_new_directory_is_current(
    pipeline_root: Path, monkeypatch: pytest.MonkeyPatch, created: int
) -> None:
    old = paths.REPORTS / "backtest/2025-연천/backtest.json"
    old.parent.mkdir(parents=True)
    old.write_text(json.dumps(backtest()))
    calls = []

    # 이전 결과도 덮어써 mtime이 최신이라는 이유로 산출물에 섞이지 않는지 확인한다.
    def command(*args: object) -> tuple[int, str]:
        calls.append(args)
        for index in range(created):
            path = paths.REPORTS / f"backtest/2026-연천-{index}/backtest.json"
            path.parent.mkdir()
            path.write_text(json.dumps(backtest()))
        old.write_text(json.dumps(backtest()))
        return 0, ""

    # 정확히 하나인 이번 실행 파일만 해시하고 모호한 결과에는 산출물을 남기지 않는다.
    monkeypatch.setattr(stages, "missing_entrypoint", lambda stage: None)
    monkeypatch.setattr(stages, "command", command)
    assert cli.main(["--from", "backtest", "--to", "backtest"]) == (0 if created == 1 else 1)
    record = latest_record(pipeline_root)
    artifacts = record["stages"][4]["artifacts"]
    assert len(calls) == 1
    assert artifacts == (
        run_record.artifacts([paths.REPORTS / "backtest/2026-연천-0/backtest.json"]) if created == 1 else []
    )
    assert stages.output_files("backtest") == []


# 새 디렉터리 이름만 있고 이번 JSON 결과가 없으면 통과시키지 않는다.
def test_new_directory_without_summary_fails(pipeline_root: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    def command(*args: object) -> tuple[int, str]:
        (paths.REPORTS / "backtest/2026-연천").mkdir(parents=True)
        return 0, ""

    # 디렉터리가 있어도 과거 결과나 빈 목록으로 게이트를 통과하지 않는다.
    monkeypatch.setattr(stages, "missing_entrypoint", lambda stage: None)
    monkeypatch.setattr(stages, "command", command)
    assert cli.main(["--from", "backtest", "--to", "backtest"]) == 1
    assert latest_record(pipeline_root)["stages"][4]["artifacts"] == []


# 골든 사례가 없으면 첫 실행·직전 비교 모두 미검증이며 publish도 통과할 수 없다.
@pytest.mark.parametrize("previous", [None, backtest()])
def test_empty_golden_unverified(pipeline_root: Path, previous: dict | None) -> None:
    current = backtest()
    current["golden"] = []
    path = paths.REPORTS / "backtest/2026-연천/backtest.json"
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps(current))
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
        path = paths.REPORTS / "backtest/2026-연천/backtest.json"
        path.parent.mkdir(parents=True)
        path.write_text(json.dumps(current))
        return 0, ""

    # 산출물이 생긴 미검증 단계와 모듈이 없는 단계를 기록에서 구별한다.
    monkeypatch.setattr(stages, "missing_entrypoint", lambda stage: None)
    monkeypatch.setattr(stages, "command", command)
    assert cli.main(["--from", "backtest", "--to", "backtest"]) == 2
    record = latest_record(pipeline_root)
    assert record["stages"][4]["status"] == "skipped"
    assert len(record["stages"][4]["artifacts"]) == 1
    assert "미검증 단계: backtest" in record["summary"]
