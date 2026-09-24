"""실행 명령의 G0 입력 고정·파이프라인 연계·전후 보고를 작은 실제 학습으로 검증한다."""

import hashlib
import json
from pathlib import Path

import polars as pl
import pytest
from crowdcast import paths
from crowdcast.models.__main__ import execute, read_inputs


# 실제 파일 입출력까지 실행하되 공유 산출물은 건드리지 않는 합성 스냅샷을 만든다.
@pytest.fixture
def model_workspace(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, model_data: tuple, label_qc: dict, config: dict
) -> Path:
    for name in ("PROCESSED", "MODELS", "REPORTS"):
        folder = tmp_path / name.lower()
        folder.mkdir()
        monkeypatch.setattr(paths, name, folder)
    frame, events = model_data
    labels = frame.drop("type", "region_daily_mean", "previous_daily_mean", "as_of").with_columns(
        pl.lit(True).alias("is_primary"),
        pl.lit(True).alias("usable_for_training"),
        pl.lit("ok").alias("quality_flag"),
    )
    labels.write_parquet(paths.PROCESSED / "labels.parquet")
    pl.DataFrame(list(events.values())).write_parquet(paths.PROCESSED / "events.parquet")
    pl.DataFrame().write_parquet(paths.PROCESSED / "region_daily.parquet")
    label_qc["labels_sha256"] = hashlib.sha256((paths.PROCESSED / "labels.parquet").read_bytes()).hexdigest()
    (paths.PROCESSED / "labels_g0.json").write_text(json.dumps(label_qc), encoding="utf-8")
    config_path = tmp_path / "model.yaml"
    config_path.write_text(json.dumps(config), encoding="utf-8")
    return config_path


# 같은 입력의 재실행은 지표·G0를 보존하며 완료 시각과 피처 검사 결과는 새로 쓴다.
def test_model_execute_outputs_and_input_guard(model_workspace: Path) -> None:
    first = execute(model_workspace)
    reports = paths.REPORTS / "backtest"
    latest_before = json.loads((reports / "latest.json").read_text())
    frozen = paths.MODELS / first["modelVersion"] / "g0.json"
    g0_bytes, g0_time = frozen.read_bytes(), frozen.stat().st_mtime_ns
    summary = (reports / first["runId"] / "backtest.json").read_bytes()
    audit_path = paths.PROCESSED / "features_availability.json"
    audit_path.write_text('{"checked": 999, "violations": 1}')
    second = execute(model_workspace, first["runId"])
    latest = json.loads((reports / "latest.json").read_text())
    assert first["runId"] == second["runId"] == latest["runId"]
    assert latest["modelVersion"] == first["modelVersion"]
    assert latest["finishedAt"] > latest_before["finishedAt"]
    assert summary == (reports / first["runId"] / "backtest.json").read_bytes()
    assert frozen.read_bytes() == g0_bytes and frozen.stat().st_mtime_ns == g0_time
    audit = json.loads(audit_path.read_text())
    assert audit["violations"] == 0 and audit["checked"] != 999
    assert "행사 입력 피처 복원 전후" in (reports / first["runId"] / "backtest.md").read_text()

    # 기본 명령으로 다시 실행해도 지정해 둔 수정 전 비교 실행을 잊지 않는다.
    execute(model_workspace)
    assert "행사 입력 피처 복원 전후" in (reports / first["runId"] / "backtest.md").read_text()

    # 세 파일의 바이트 중 하나만 달라도 성공 표시와 G0를 건드리기 전에 멈춘다.
    latest_bytes = (reports / "latest.json").read_bytes()
    for filename in ("labels.parquet", "labels_g0.json", "events.parquet"):
        path = paths.PROCESSED / filename
        original = path.read_bytes()
        if filename.endswith(".json"):
            path.write_bytes(original + b"\n")
        else:
            frame = pl.read_parquet(path)
            field = "daily_mean" if filename == "labels.parquet" else "name"
            changed = pl.col(field) + (1 if field == "daily_mean" else " 수정")
            frame.with_columns(changed.alias(field)).write_parquet(path)
        with pytest.raises(ValueError, match="입력이 바뀌었다 — T-103부터 다시"):
            execute(model_workspace)
        assert frozen.read_bytes() == g0_bytes
        assert (reports / "latest.json").read_bytes() == latest_bytes
        path.write_bytes(original)


# QC 파싱과 해시가 동일 바이트를 사용하고 세 G0 원본을 모두 기록한다.
def test_model_input_snapshot(model_workspace: Path) -> None:
    frames, qc, hashes = read_inputs(paths.PROCESSED)
    assert set(frames) == {"labels", "events", "region_daily"}
    assert qc["labels_sha256"] == hashes["labels"]
    for name in ("labels", "events", "labels_g0"):
        suffix = ".json" if name == "labels_g0" else ".parquet"
        assert hashes[name] == hashlib.sha256((paths.PROCESSED / (name + suffix)).read_bytes()).hexdigest()
