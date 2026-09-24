"""후속 단계의 정상 종료만으로 과거·누락·부분 갱신 산출물을 승인하지 않는다."""

import json
import os
from pathlib import Path
from time import time_ns

import polars as pl
import pytest
from crowdcast import paths
from crowdcast.pipeline import __main__ as cli
from crowdcast.pipeline import run_record, stages
from pipeline_fixtures import backtest, latest_record, write_backtest, write_features


# 각 모듈이 실제로 저장할 계약·표 모양의 소형 산출물을 준비한다.
def prepare_outputs(stage: str) -> list[Path]:
    if stage == "features":
        write_features()
        return [paths.PROCESSED / "features_availability.json", paths.PROCESSED / "features.parquet"]
    if stage == "train":
        fixture = paths.REPO_ROOT / "packages/contracts/fixtures/model-card/valid-v0-1-0.json"
        content = json.loads(fixture.read_bytes())
        directory = paths.MODELS / content["modelVersion"]
        directory.mkdir(exist_ok=True)
        card = directory / "model_card.json"
        card.write_text(json.dumps(content))
        models = [directory / f"p{quantile}.txt" for quantile in (10, 50, 90)]
        for model in models:
            model.write_text("연천구석기축제 합성 학습 모형")
        summary = backtest()
        summary["modelVersion"] = content["modelVersion"]
        write_backtest(summary)
        return [card, *models]
    upcoming = paths.PROCESSED / "upcoming.parquet"
    pl.DataFrame({"event_id": ["ev-연천구석기축제-2025"]}).write_parquet(upcoming)
    return [upcoming]


# 필수 파일 하나라도 과거·누락이면 실패하며 전부 갱신했을 때만 통과해야 한다.
@pytest.mark.parametrize("stage", ["features", "batch"])
@pytest.mark.parametrize("change", ["none", "missing", "first_only", "last_only", "all"])
def test_required_outputs_must_all_be_current(
    pipeline_root: Path, monkeypatch: pytest.MonkeyPatch, stage: str, change: str
) -> None:
    files = prepare_outputs(stage)
    for path in files:
        os.utime(path, ns=(1_000_000_000, 1_000_000_000))
    calls = []

    # 정상 종료 가짜 모듈이 일부 파일만 갱신하거나 아무 산출물도 남기지 않는 경우를 재현한다.
    def command(*args: object) -> tuple[int, str]:
        calls.append(args)
        if change == "missing":
            files[-1].unlink()
        changed = {"none": [], "missing": [], "first_only": files[:1], "last_only": files[-1:], "all": files}
        for path in changed[change]:
            path.write_bytes(path.read_bytes())
            written_ns = time_ns()
            os.utime(path, ns=(written_ns, written_ns))
        return 0, ""

    # 실패 뒤 publish가 대기 상태로 남고 오래된 파일의 해시가 이번 실행에 붙지 않아야 한다.
    monkeypatch.setattr(stages, "missing_entrypoint", lambda name: None)
    monkeypatch.setattr(stages, "command", command)
    passed = change == "all" or stage == "batch" and change in {"first_only", "last_only"}
    assert cli.main(["--from", stage, "--to", stage if passed else "publish"]) == (0 if passed else 1)
    record = latest_record(pipeline_root)
    row = record["stages"][stages.STAGES.index(stage)]
    assert len(calls) == 1
    assert row["gate"]["passed"] is passed
    assert row["artifacts"] == (run_record.artifacts(files) if passed else [])
    if not passed:
        assert record["stages"][-1]["status"] == "pending"
        assert "산출물" in row["gate"]["message"]


# 학습은 완료 포인터로 판정한다 — 새 포인터·모델 파일이면 통과, 포인터가 그대로거나 모델 파일이 없으면 실패.
@pytest.mark.parametrize("case", ["published", "unchanged", "empty"])
def test_train_uses_completion_pointer(
    pipeline_root: Path, monkeypatch: pytest.MonkeyPatch, case: str
) -> None:
    files = prepare_outputs("train")

    # 정상 종료 가짜 학습이 포인터를 새로 쓰거나(같은 버전 재실행) 아무것도 쓰지 않는 경우를 재현한다.
    def command(*args: object) -> tuple[int, str]:
        if case != "unchanged":
            summary = backtest()
            summary["modelVersion"] = json.loads(files[0].read_bytes())["modelVersion"]
            write_backtest(summary)
        if case == "empty":
            for model in files[1:]:
                model.unlink()
        return 0, ""

    monkeypatch.setattr(stages, "missing_entrypoint", lambda name: None)
    monkeypatch.setattr(stages, "command", command)
    assert cli.main(["--from", "train", "--to", "train"]) == (0 if case == "published" else 1)
    message = latest_record(pipeline_root)["stages"][3]["gate"]["message"]
    expected = {"published": "모델 카드 계약 통과", "unchanged": "latest.json", "empty": "모델 파일=False"}
    assert expected[case] in message


# 수정 시각이 단계 시작과 같으면 허용하고 단 1ns라도 이전이면 거부한다.
@pytest.mark.parametrize("offset", [-1, 0, 1])
def test_output_timestamp_boundary(pipeline_root: Path, offset: int) -> None:
    path = prepare_outputs("batch")[0]
    started_ns = 1_790_000_000_000_000_000
    os.utime(path, ns=(started_ns + offset, started_ns + offset))
    if offset < 0:
        with pytest.raises(ValueError, match="갱신되지 않은"):
            run_record.current_outputs(stages.REQUIRED_OUTPUTS["batch"], started_ns)
    else:
        assert run_record.current_outputs(stages.REQUIRED_OUTPUTS["batch"], started_ns) == [path]


# 모듈만 있고 필수 산출물 정의가 없으면 검증 없이 실행하는 대신 skipped로 남긴다.
def test_stage_without_output_spec_is_skipped(pipeline_root: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delitem(stages.REQUIRED_OUTPUTS, "features")
    monkeypatch.setattr(stages.importlib.util, "find_spec", lambda name: object())
    monkeypatch.setattr(stages, "command", lambda *a: pytest.fail("산출물 정의 없이 실행"))
    assert cli.main(["--from", "features", "--to", "features"]) == 2
    stage = latest_record(pipeline_root)["stages"][2]
    assert stage["status"] == "skipped" and "필수 산출물 표 없음" in stage["gate"]["message"]


# 연속 실행에서 train이 먼저 새 결과를 발행해도 backtest는 실행 시작 때의 결과와 비교해 악화를 잡는다.
def test_backtest_compares_with_result_before_train(
    pipeline_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    files = prepare_outputs("train")
    version = json.loads(files[0].read_bytes())["modelVersion"]

    # 가짜 학습·백테스트가 같은 새 버전(포함률 0.8 → 0.5)을 발행하고 완료 포인터를 새로 쓴다.
    def command(*args: object) -> tuple[int, str]:
        worse = backtest(coverage=0.5)
        worse["runId"], worse["modelVersion"] = "backtest-worse", version
        write_backtest(worse)
        return 0, ""

    monkeypatch.setattr(stages, "missing_entrypoint", lambda name: None)
    monkeypatch.setattr(stages, "command", command)
    assert cli.main(["--from", "train", "--to", "backtest"]) == 1
    row = latest_record(pipeline_root)["stages"][4]
    assert row["gate"]["passed"] is False
    assert "직전 80.0%" in row["gate"]["message"]
