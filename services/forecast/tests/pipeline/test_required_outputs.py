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
from pipeline_fixtures import latest_record, write_features


# 각 모듈이 실제로 저장할 계약·표 모양의 소형 산출물을 준비한다.
def prepare_outputs(stage: str) -> list[Path]:
    if stage == "features":
        write_features()
        return [paths.PROCESSED / "features_availability.json", paths.PROCESSED / "features.parquet"]
    if stage == "train":
        card = paths.MODELS / "model_card.json"
        fixture = paths.REPO_ROOT / "packages/contracts/fixtures/model-card/valid-v0-1-0.json"
        content = json.loads(fixture.read_bytes())
        card.write_text(json.dumps(content))
        directory = paths.MODELS / content["modelVersion"]
        directory.mkdir(exist_ok=True)
        models = [directory / f"p{quantile}.txt" for quantile in (10, 50, 90)]
        for model in models:
            model.write_text("연천구석기축제 합성 학습 모형")
        return [card, *models]
    upcoming = paths.PROCESSED / "upcoming.parquet"
    pl.DataFrame({"event_id": ["ev-연천구석기축제-2025"]}).write_parquet(upcoming)
    return [upcoming]


# 필수 파일 하나라도 과거·누락이면 실패하며 전부 갱신했을 때만 통과해야 한다.
@pytest.mark.parametrize("stage", ["features", "train", "batch"])
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


# 모델 카드만 저장하고 실제 버전 디렉터리를 비워 둔 학습은 성공이 아니다.
def test_empty_model_directory_fails(pipeline_root: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    def command(*args: object) -> tuple[int, str]:
        files = prepare_outputs("train")
        for model in files[1:]:
            model.unlink()
        written_ns = time_ns()
        os.utime(files[0], ns=(written_ns, written_ns))
        return 0, ""

    # 카드 계약과 무관하게 모델 파일 존재 조건을 따로 확인한다.
    monkeypatch.setattr(stages, "missing_entrypoint", lambda name: None)
    monkeypatch.setattr(stages, "command", command)
    assert cli.main(["--from", "train", "--to", "train"]) == 1
    assert "모델 파일" in latest_record(pipeline_root)["stages"][3]["gate"]["message"]


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
