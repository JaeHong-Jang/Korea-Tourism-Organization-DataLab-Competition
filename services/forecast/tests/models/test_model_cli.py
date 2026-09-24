"""실행 명령의 G0 입력 고정·파이프라인 연계·전후 보고를 작은 실제 학습으로 검증한다."""

import hashlib
import json
from pathlib import Path

import polars as pl
import pytest
from crowdcast import paths
from crowdcast.labels.g0 import build_g0
from crowdcast.models import __main__ as cli
from crowdcast.models.__main__ import execute, read_inputs
from crowdcast.models.backtest import metrics
from crowdcast.models.card import CONDITIONAL_DEFINITION
from crowdcast.models.publish import run_lock


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
    rows = pl.read_parquet(paths.PROCESSED / "events.parquet").to_dicts()
    label_qc["g0"] = json.loads(json.dumps(build_g0(labels, rows)))
    (paths.PROCESSED / "labels_g0.json").write_text(json.dumps(label_qc), encoding="utf-8")
    config_path = tmp_path / "model.yaml"
    config_path.write_text(json.dumps(config), encoding="utf-8")
    return config_path


# 같은 입력의 재실행은 발행 폴더를 바꾸지 않고 완료 시각과 피처 검사 결과만 새로 쓴다.
def test_model_execute_outputs_and_input_guard(model_workspace: Path) -> None:
    first = execute(model_workspace)
    reports = paths.REPORTS / "backtest"
    latest_before = json.loads((reports / "latest.json").read_text())
    directory = paths.MODELS / first["modelVersion"]
    frozen = directory / "g0.json"
    g0_bytes, g0_time = frozen.read_bytes(), frozen.stat().st_mtime_ns
    published = (snapshot(directory), snapshot(reports / first["runId"]))
    audit_path = paths.PROCESSED / "features_availability.json"
    audit_path.write_text('{"checked": 999, "violations": 1}')
    second = execute(model_workspace)
    latest = json.loads((reports / "latest.json").read_text())
    assert first["runId"] == second["runId"] == latest["runId"]
    assert latest["modelVersion"] == first["modelVersion"]
    assert latest["finishedAt"] > latest_before["finishedAt"]
    assert (snapshot(directory), snapshot(reports / first["runId"])) == published
    assert frozen.read_bytes() == g0_bytes and frozen.stat().st_mtime_ns == g0_time
    audit = json.loads(audit_path.read_text())
    assert audit["violations"] == 0 and audit["checked"] != 999

    # 두 정의는 별도 열로 저장하고 계약 주 지표는 조건부·주 모델 표본으로만 계산한다.
    summary = (reports / first["runId"] / "backtest.json").read_bytes()
    points = pl.read_parquet(reports / first["runId"] / "points.parquet")
    assert set(points["evaluation_definition"]) == {"conditional", "filename_sensitivity"}
    conditional = points.filter(pl.col("evaluation_definition") == "conditional")
    sensitivity = points.filter(pl.col("evaluation_definition") == "filename_sensitivity")
    assert conditional.select("eventId", "model").equals(sensitivity.select("eventId", "model"))
    assert json.loads(summary)["metrics"] == metrics(
        conditional.filter(pl.col("model") == "simple").to_dicts()
    )
    card = json.loads((directory / "model_card.json").read_text())
    assert not (paths.MODELS / "model_card.json").exists()
    assert (paths.MODELS / "g0" / first["modelVersion"] / "g0.json").read_bytes() == g0_bytes
    report = (reports / first["runId"] / "backtest.md").read_text()
    assert CONDITIONAL_DEFINITION in card["notes"] and CONDITIONAL_DEFINITION in report
    assert "참고: 파일명 날짜 기준 민감도" in report and "공개일 미입증" in report
    assert (directory / "p50.txt").read_bytes() == (directory / "2025/p50.txt").read_bytes()
    assert (directory / "filename_sensitivity/p50.txt").is_file()

    # 해시 목록은 불변 산출물만 담고 발행된 바이트와 모두 일치하며 포인터 파일은 담지 않는다.
    hashes = json.loads((directory / "artifact_hashes.json").read_text())
    assert "reports/backtest/latest.json" not in hashes and "models/model_card.json" not in hashes
    for name, digest in hashes.items():
        if name.startswith(("models/", "reports/")):
            path = (paths.MODELS if name.startswith("models/") else paths.REPORTS).joinpath(
                *name.split("/")[1:]
            )
            assert hashlib.sha256(path.read_bytes()).hexdigest() == digest, name

    # QC 집계와 어긋난 원본 변경은 성공 표시와 G0를 건드리기 전에 멈춘다.
    latest_bytes = (reports / "latest.json").read_bytes()
    for filename in ("labels.parquet", "events.parquet"):
        path = paths.PROCESSED / filename
        original = path.read_bytes()
        frame = pl.read_parquet(path)
        if filename == "labels.parquet":
            frame = frame.with_columns((pl.col("daily_mean") + 1).alias("daily_mean"))
        else:
            # 골드 행사의 일정을 지우면 G0 순간 최대 환산 층이 바뀐다.
            gold = pl.col("event_id").str.ends_with("-0")
            frame = frame.with_columns(pl.when(gold).then(None).otherwise(pl.col("start")).alias("start"))
        frame.write_parquet(path)
        with pytest.raises(ValueError, match="입력이 바뀌었다 — T-103부터 다시"):
            execute(model_workspace)
        assert frozen.read_bytes() == g0_bytes
        assert (reports / "latest.json").read_bytes() == latest_bytes
        path.write_bytes(original)

    # QC 파일이 다시 쓰이면 새 버전이 현재 입력으로 검증된 G0를 다시 고정하고 이전 버전 산출물은 그대로 둔다.
    rebuilt = execute_rebuilt(model_workspace, first["runId"])
    assert rebuilt["modelVersion"] != first["modelVersion"]
    assert json.loads((reports / "latest.json").read_text())["runId"] == rebuilt["runId"]
    assert (snapshot(directory), snapshot(reports / first["runId"])) == published
    manifest = json.loads((paths.MODELS / rebuilt["modelVersion"] / "run.json").read_text())
    assert manifest["supersedes"] == {"modelVersion": first["modelVersion"], "changedInputs": ["labels_g0"]}
    assert "행사 입력 피처 복원 전후" in (reports / rebuilt["runId"] / "backtest.md").read_text()

    # 기본 명령으로 다시 실행해도 지정해 둔 비교 실행을 잊지 않고, 다른 비교로 발행본을 바꾸지 못한다.
    new_published = snapshot(reports / rebuilt["runId"])
    execute(model_workspace)
    assert snapshot(reports / rebuilt["runId"]) == new_published
    pointer = (reports / "latest.json").read_bytes()
    with pytest.raises(RuntimeError, match="발행본은 바꾸지 않는다"):
        execute(model_workspace, rebuilt["runId"])
    assert snapshot(reports / rebuilt["runId"]) == new_published
    assert (reports / "latest.json").read_bytes() == pointer


# T-103을 다시 돌린 것처럼 QC 파일 바이트를 바꿔 새 버전 실행을 만든다.
def execute_rebuilt(config_path: Path, compare_run: str | None = None) -> dict:
    qc_path = paths.PROCESSED / "labels_g0.json"
    qc_path.write_bytes(qc_path.read_bytes() + b"\n")
    return execute(config_path, compare_run)


# 폴더 안 모든 파일의 바이트를 경로별로 모아 발행 전후를 비교한다.
def snapshot(root: Path) -> dict[str, bytes]:
    return {
        str(path.relative_to(root)): path.read_bytes() for path in sorted(root.rglob("*")) if path.is_file()
    }


# QC 파싱과 해시가 동일 바이트를 사용하고 세 G0 원본을 모두 기록한다.
def test_model_input_snapshot(model_workspace: Path) -> None:
    frames, qc, hashes = read_inputs(paths.PROCESSED)
    assert set(frames) == {"labels", "events", "region_daily"}
    assert qc["labels_sha256"] == hashes["labels"]
    for name in ("labels", "events", "labels_g0"):
        suffix = ".json" if name == "labels_g0" else ".parquet"
        assert hashes[name] == hashlib.sha256((paths.PROCESSED / (name + suffix)).read_bytes()).hexdigest()


# 새 버전의 해시 기록·계약 검증·폴더 드러내기·포인터 교체 중 하나가 실패해도 기존 발행과 포인터를 그대로 둔다.
@pytest.mark.parametrize("failure", ["hash", "contract", "expose", "pointer"])
def test_failed_run_preserves_published(
    model_workspace: Path, monkeypatch: pytest.MonkeyPatch, failure: str
) -> None:
    first = execute(model_workspace)
    reports = paths.REPORTS / "backtest"
    latest = reports / "latest.json"
    before, timestamp = latest.read_bytes(), latest.stat().st_mtime_ns
    published = {
        "models": snapshot(paths.MODELS / first["modelVersion"]),
        "reports": snapshot(reports / first["runId"]),
    }
    write_text, rename, replace = Path.write_text, Path.rename, Path.replace

    # 실제 해시 기록 지점의 디스크 오류를 주입해 성공 표시가 먼저 나가지 않게 한다.
    def fail_hash(path: Path, *args: object, **kwargs: object) -> int:
        if path.name == "artifact_hashes.json":
            raise OSError("해시 기록 실패")
        return write_text(path, *args, **kwargs)

    # 계약 오류 역시 마지막 포인터 갱신 전 반드시 실행되는지 확인한다.
    def fail_contract(*args: object) -> None:
        raise ValueError("계약 검증 실패")

    # 모델 폴더를 드러낸 뒤 보고서 폴더를 드러내다 실패하면 포인터는 옛 실행을 그대로 가리킨다.
    def fail_expose(path: Path, target: Path) -> Path:
        if path.name.startswith(".staging-bt-"):
            raise OSError("보고서 폴더 드러내기 실패")
        return rename(path, target)

    # 완료 포인터 교체가 실패하면 임시 파일을 남기지 않고 옛 포인터를 그대로 둔다.
    def fail_pointer(path: Path, target: Path) -> Path:
        if path.name.startswith(".latest.json."):
            raise OSError("완료 포인터 교체 실패")
        return replace(path, target)

    patches = {
        "hash": (Path, "write_text", fail_hash),
        "contract": (cli, "validate_contract", fail_contract),
        "expose": (Path, "rename", fail_expose),
        "pointer": (Path, "replace", fail_pointer),
    }
    with monkeypatch.context() as patch:
        patch.setattr(*patches[failure])
        with pytest.raises((OSError, ValueError), match="실패"):
            execute_rebuilt(model_workspace)
    assert latest.read_bytes() == before and latest.stat().st_mtime_ns == timestamp
    assert snapshot(paths.MODELS / first["modelVersion"]) == published["models"]
    assert snapshot(reports / first["runId"]) == published["reports"]
    leftovers = [*paths.MODELS.glob(".staging-*"), *reports.glob(".staging-*")]
    leftovers += [*paths.MODELS.rglob("*.tmp"), *reports.glob("*.tmp")]
    assert leftovers == []

    # 실패한 새 버전은 다음 실행에서 이어서 드러나고 포인터가 새 버전으로 바뀐다.
    recovered = execute(model_workspace)
    assert recovered["modelVersion"] != first["modelVersion"]
    assert json.loads(latest.read_text())["runId"] == recovered["runId"]
    assert (reports / recovered["runId"] / "backtest.json").is_file()


# 다른 실행이 잠금을 쥐고 있으면 아무 파일도 건드리지 않고 바로 멈춘다.
def test_concurrent_run_is_refused(model_workspace: Path) -> None:
    execute(model_workspace)
    latest = paths.REPORTS / "backtest" / "latest.json"
    before = latest.read_bytes()
    with run_lock(paths.MODELS), pytest.raises(RuntimeError, match="다른 백테스트 실행 중"):
        execute(model_workspace)
    assert latest.read_bytes() == before
