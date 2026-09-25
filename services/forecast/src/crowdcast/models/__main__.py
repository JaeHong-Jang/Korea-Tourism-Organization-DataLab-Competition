"""같은 입력·설정으로 G0 고정부터 백테스트와 모델 카드 검증까지 실행한다."""

import argparse
import hashlib
import importlib.metadata
import io
import json
import shutil
import sys
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import polars as pl
import yaml
from crowdcast import paths
from crowdcast.models.card import backtest_markdown, validate_contract
from crowdcast.models.compat import check_compatibility
from crowdcast.models.evaluate import run_models, select_features
from crowdcast.models.g0 import freeze_g0, previous_version, verify_qc
from crowdcast.models.publish import (
    publish_directory,
    run_lock,
    staging,
    write_artifact_hashes,
    write_atomic,
)

# 실행 기록·해시 목록은 재실행마다 달라져 발행본 비교에서 뺀다.
VOLATILE_MODEL_FILES = frozenset({"run.json", "artifact_hashes.json"})


# 입력은 한 번만 읽어 해시와 표가 같은 스냅샷을 가리키게 한다.
def read_inputs(processed: Path) -> tuple[dict[str, pl.DataFrame], dict[str, Any], dict[str, str]]:
    frames, hashes = {}, {}
    for name in ("labels", "events", "region_daily"):
        raw = (processed / f"{name}.parquet").read_bytes()
        hashes[name] = hashlib.sha256(raw).hexdigest()
        frames[name] = pl.read_parquet(io.BytesIO(raw))
    raw_qc = (processed / "labels_g0.json").read_bytes()
    hashes["labels_g0"] = hashlib.sha256(raw_qc).hexdigest()
    return frames, json.loads(raw_qc), hashes


# 데이터·설정·결정 코드·라이브러리 버전이 바뀌면 새 모델 버전을 사용한다.
def model_version(input_hashes: dict[str, str], config: dict[str, Any]) -> str:
    source = Path(__file__).resolve().parents[1]
    files = sorted(
        path for folder in ("features", "models", "rules") for path in (source / folder).glob("*.py")
    )
    files += sorted((paths.REPO_ROOT / "configs").glob("*.yaml"))
    versions = {
        name: importlib.metadata.version(name)
        for name in ("lightgbm", "mapie", "numpy", "polars", "holidays")
    }
    digest = hashlib.sha256(
        json.dumps({"inputs": input_hashes, "config": config, "versions": versions}, sort_keys=True).encode()
    )
    for path in files:
        digest.update(path.name.encode())
        digest.update(path.read_bytes())
    return "v2-" + digest.hexdigest()[:20]


# 표본 하한과 평가 연도 목록을 실행 전에 확인한다.
def read_config(path: Path) -> dict[str, Any]:
    config = yaml.safe_load(path.read_text(encoding="utf-8"))
    if config["min_train_rows"] < 20 or config["min_calibration_rows"] < 10:
        raise ValueError("학습 최소 20·보정 최소 10 표본 설정이 필요합니다")
    if not config["eval_years"] or len(set(config["eval_years"])) != len(config["eval_years"]):
        raise ValueError("평가 연도는 중복 없는 목록이어야 합니다")
    if config["silver_weight"] <= 0 or config["gold_weight"] <= 0:
        raise ValueError("라벨 가중치는 양수여야 합니다")
    return config


# 같은 저장소의 실행은 잠금으로 하나씩만 돌린다.
def execute(config_path: Path, compare_run: str | None = None) -> dict[str, Any]:
    with run_lock(paths.MODELS):
        return execute_locked(config_path, compare_run)


# 파일을 쓰기 전에 계약을 검사해 미정의 지표와 잘못된 식별자 발행을 막는다.
def execute_locked(config_path: Path, compare_run: str | None) -> dict[str, Any]:
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="crowdcast-compat-") as temporary:
        check_compatibility(Path(temporary))
    config = read_config(config_path)
    frames, qc, hashes = read_inputs(paths.PROCESSED)
    verify_qc(qc, frames["labels"], frames["events"].to_dicts())
    pointer = paths.REPORTS / "backtest" / "latest.json"
    supersedes = previous_version(paths.MODELS, hashes, pointer)
    version = model_version(hashes, config)
    directory = paths.MODELS / version
    g0_path = freeze_g0(paths.MODELS / "g0" / version, qc, hashes, config["eval_years"], version)
    g0_before = g0_path.read_bytes()
    run_id = "bt-" + version
    report_directory = paths.REPORTS / "backtest" / run_id

    # 산출물은 임시 폴더에서 완성·검증하고, 이미 드러난 실행 폴더는 같은 버전 재실행에서도 바꾸지 않는다.
    with staging(directory) as models_stage, staging(report_directory) as reports_stage:
        shutil.copy2(g0_path, models_stage / "g0.json")
        result, card, backtest, excluded = run_models(
            frames, config, g0_path, hashes, models_stage, report_directory, version
        )
        if g0_path.read_bytes() != g0_before or (models_stage / "g0.json").read_bytes() != g0_before:
            raise RuntimeError("백테스트 중 G0가 변경되었습니다")

        # 같은 버전의 모델 카드는 처음 발행한 시각을 유지해 기준 그래프에 등록된 내용과 같게 둔다.
        if (directory / "model_card.json").exists():
            card["createdAt"] = json.loads((directory / "model_card.json").read_text(encoding="utf-8"))[
                "createdAt"
            ]
        validate_contract("backtest-summary", backtest)
        validate_contract("model-card", card)

        # 같은 버전의 명령 재실행에서도 한 번 지정한 수정 전 비교표를 보존한다(모델 폴더가 먼저 드러난다).
        manifest_path = directory / "run.json"
        if compare_run is None and manifest_path.exists():
            compare_run = json.loads(manifest_path.read_text(encoding="utf-8")).get("comparison_run_id")
        (reports_stage / "backtest.json").write_bytes(json_bytes(backtest))
        (models_stage / "model_card.json").write_bytes(json_bytes(card))
        (reports_stage / "backtest.md").write_text(
            backtest_markdown(result, card, excluded, hashes, comparison_points(compare_run)),
            encoding="utf-8",
        )
        all_points = [
            {**point, "evaluation_definition": definition}
            for definition, evaluation in (
                ("conditional", result),
                ("filename_sensitivity", result["sensitivity"]),
            )
            for point in evaluation["points"]
        ]
        pl.DataFrame(all_points, infer_schema_length=None).write_parquet(reports_stage / "points.parquet")
        elapsed = time.monotonic() - started
        manifest = {
            "model_version": version,
            "run_id": run_id,
            "input_hashes": hashes,
            "config": config,
            "folds": result["folds"],
            "excluded": excluded,
            "elapsed_seconds": elapsed,
            "golden_skipped": result["golden_skipped"],
            "comparison_run_id": compare_run,
            "supersedes": supersedes,
        }
        (models_stage / "run.json").write_text(
            json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8"
        )
        write_artifact_hashes(
            models_stage,
            reports_stage,
            (directory.name, report_directory.name),
            paths.PROCESSED / "features_availability.json",
        )

        # 모델 → 보고서 순으로 완성된 폴더를 한 번에 드러낸다(중단 뒤 재실행은 모델 폴더의 비교 설정을 쓴다).
        publish_directory(models_stage, directory, VOLATILE_MODEL_FILES)
        publish_directory(reports_stage, report_directory)

    # 두 폴더가 모두 드러난 뒤 유일한 완료 포인터를 원자적으로 바꾼다(독자는 이 포인터로 모델 카드를 찾는다).
    latest = {"runId": run_id, "modelVersion": version, "finishedAt": datetime.now(UTC).isoformat()}
    write_atomic(pointer, (json.dumps(latest, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    return {
        "modelVersion": version,
        "runId": run_id,
        "metrics": backtest["metrics"],
        "elapsedSeconds": elapsed,
        "reports": str(report_directory),
        "models": str(directory),
    }


# 비교 실행은 이미 발행된 실행의 조건부 점수만 읽는다.
def comparison_points(compare_run: str | None) -> tuple[str, list[dict[str, Any]]] | None:
    if compare_run is None:
        return None
    if Path(compare_run).name != compare_run or not compare_run.startswith("bt-"):
        raise ValueError("비교 실행은 reports/backtest 아래 runId여야 합니다")
    previous = paths.REPORTS / "backtest" / compare_run / "points.parquet"
    return (
        compare_run,
        [
            point
            for point in pl.read_parquet(previous).to_dicts()
            if point.get("evaluation_definition", "conditional") == "conditional"
        ],
    )


# 계약 문서는 정렬·들여쓰기를 고정한 같은 바이트로 기록한다.
def json_bytes(value: dict[str, Any]) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True, allow_nan=False) + "\n").encode(
        "utf-8"
    )


# 파이프라인 features 단계: 백테스트와 같은 표본 선택으로 피처와 공개 시점 검사 결과를 저장한다.
def write_features(config_path: Path) -> dict[str, Any]:
    with run_lock(paths.MODELS):
        frames, _, _ = read_inputs(paths.PROCESSED)
        features = select_features(frames, read_config(config_path))["features"]
        buffer = io.BytesIO()
        features.write_parquet(buffer)
        write_atomic(paths.PROCESSED / "features.parquet", buffer.getvalue())
    return {"features": features.height, "path": "data/processed/features.parquet"}


# 데이터 추가 뒤에도 같은 명령을 쓰도록 입력 위치는 공용 경로 설정을 따른다.
def main() -> None:
    # 도전 모델 비교는 자기 인자를 가진 하위 명령으로 넘긴다(T-211 — 승격 없음).
    if sys.argv[1:2] == ["challenger"]:
        from crowdcast.models.challenger.__main__ import main as challenger_main

        sys.argv = [sys.argv[0], *sys.argv[2:]]
        challenger_main()
        return
    parser = argparse.ArgumentParser(description="공개 시점 피처·G0 고정·롤링 백테스트")
    # 학습과 롤링 백테스트는 한 실행이다(최종 모델 = 마지막 분할) — train·backtest 단계가 같은 명령을 부른다.
    parser.add_argument("command", choices=["features", "train", "backtest"])
    parser.add_argument("--config", type=Path, default=paths.REPO_ROOT / "configs/model.yaml")
    parser.add_argument("--compare-run", help="보고서에만 나란히 표시할 수정 전 실행 ID")
    arguments = parser.parse_args()
    if arguments.command == "features":
        result = write_features(arguments.config)
    else:
        result = execute(arguments.config, arguments.compare_run)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
