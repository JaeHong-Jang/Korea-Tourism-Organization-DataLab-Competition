"""기존 CLI 인자·골든 제외 보존과 선택 모듈 부재·의존성 실패의 차이를 검증한다."""

import json
import subprocess
import sys
from pathlib import Path

import polars as pl
import pytest
from crowdcast import paths
from crowdcast.pipeline import __main__ as cli
from crowdcast.pipeline import run_record, stages


# 콜론 표기는 파이썬 속성 호출이 아니라 확정된 CLI 하위 명령으로 실행한다.
def test_command_argv(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = []

    # 실제 서브프로세스 대신 실행 인자와 stdin 차단 여부를 관찰한다.
    def execute(argv: list[str], **kwargs: object) -> subprocess.CompletedProcess:
        calls.append((argv, kwargs))
        return subprocess.CompletedProcess(argv, 4, stdout="검증 실패", stderr="")

    # CLI 호출 형식과 실패 종료 코드가 보존되는지 함께 확인한다.
    monkeypatch.setattr(stages.subprocess, "run", execute)
    code, detail = stages.command(stages.ENTRYPOINTS["backtest"][0])
    assert code == 4 and "검증 실패" in detail
    assert calls[0][0] == [sys.executable, "-m", "crowdcast.models", "backtest"]
    assert calls[0][1]["stdin"] == subprocess.DEVNULL


# 부모 패키지도 없는 경우는 skipped지만 내부 의존성 부재를 모듈 미설치로 숨기지 않는다.
@pytest.mark.parametrize(("missing", "skipped"), [("crowdcast.models", True), ("lightgbm", False)])
def test_module_discovery_distinguishes_dependency(
    monkeypatch: pytest.MonkeyPatch,
    missing: str,
    skipped: bool,
) -> None:
    # find_spec에서 실제로 발생할 수 있는 부모·의존성 부재를 재현한다.
    def find(name: str) -> None:
        raise ModuleNotFoundError(name=missing)

    # 단순 부재와 고장 난 설치를 다른 경로로 보고하는지 확인한다.
    monkeypatch.setattr(stages.importlib.util, "find_spec", find)
    if skipped:
        assert stages.missing_entrypoint("backtest") == "crowdcast.models:backtest"
    else:
        with pytest.raises(ModuleNotFoundError):
            stages.missing_entrypoint("backtest")


# labels에만 남아 있는 골든 ID도 events 재구축과 labels 실행에 모두 전달한다.
def test_golden_ids_preserved(pipeline_root: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    events = pl.DataFrame({"event_id": ["ev-영종불꽃축제-2025"], "is_golden": [True]})
    events.write_parquet(paths.PROCESSED / "labels.parquet")
    seen = []

    # 임시 입력이 존재하는 동안 내용을 검사하고 종료 뒤 삭제됐는지도 확인한다.
    def command(entry: str, args: list[str]) -> tuple[int, str]:
        path = Path(args[args.index("--golden-file") + 1])
        seen.append((entry, args, path))
        assert json.loads(path.read_bytes()) == ["ev-영종불꽃축제-2025"]
        return 0, ""

    # 두 CLI에 같은 골든 목록을 전달하고 임시 파일은 정리한다.
    monkeypatch.setattr(stages, "command", command)
    assert stages.golden_command("crowdcast.data.events", ["--offline"])[0] == 0
    assert stages.golden_command("crowdcast.labels", [])[0] == 0
    assert seen[0][1][0] == "--offline"
    assert all(not item[2].exists() for item in seen)


# publish는 기록 발행 게이트이며 미구현·선택 제외 단계를 성공으로 바꾸지 않는다.
def test_publish_requires_every_stage() -> None:
    record = run_record.new_record(stages.STAGES, stages.STAGES, False)
    assert cli.publish_gate(record, False)["passed"] is None
    for stage in record["stages"][:-1]:
        stage["status"] = "passed"
        stage["gate"]["passed"] = True
    assert cli.publish_gate(record, False)["passed"] is True
    assert cli.publish_gate(record, True)["passed"] is None
