"""같은 입력·설정으로 G0 고정부터 백테스트와 모델 카드 검증까지 실행한다."""

import argparse
import hashlib
import importlib.metadata
import io
import json
import tempfile
import time
from collections import Counter
from pathlib import Path
from typing import Any

import polars as pl
import yaml
from crowdcast import paths
from crowdcast.features.build import build_features
from crowdcast.models.backtest import run_backtest, summary
from crowdcast.models.card import backtest_markdown, model_card, validate_contract
from crowdcast.models.compat import check_compatibility
from crowdcast.models.g0 import freeze_g0
from crowdcast.models.train import select_labels


# 입력은 한 번만 읽어 해시와 표가 같은 스냅샷을 가리키게 한다.
def read_inputs(processed: Path) -> tuple[dict[str, pl.DataFrame], dict[str, str]]:
    frames, hashes = {}, {}
    for name in ("labels", "events", "region_daily"):
        raw = (processed / f"{name}.parquet").read_bytes()
        hashes[name] = hashlib.sha256(raw).hexdigest()
        frames[name] = pl.read_parquet(io.BytesIO(raw))
    return frames, hashes


# 데이터·설정·결정 코드·라이브러리 버전이 바뀌면 새 모델 버전을 사용한다.
def model_version(input_hashes: dict[str, str], config: dict[str, Any]) -> str:
    source = Path(__file__).resolve().parents[1]
    files = sorted(
        path for folder in ("features", "models", "rules") for path in (source / folder).glob("*.py")
    )
    files += sorted((paths.REPO_ROOT / "configs").glob("*.yaml"))
    versions = {name: importlib.metadata.version(name) for name in ("lightgbm", "mapie", "numpy", "polars")}
    digest = hashlib.sha256(
        json.dumps({"inputs": input_hashes, "config": config, "versions": versions}, sort_keys=True).encode()
    )
    for path in files:
        digest.update(path.name.encode())
        digest.update(path.read_bytes())
    return "v1-" + digest.hexdigest()[:20]


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


# 파일을 쓰기 전에 계약을 검사해 미정의 지표와 잘못된 식별자 발행을 막는다.
def execute(config_path: Path) -> dict[str, Any]:
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="crowdcast-compat-") as temporary:
        check_compatibility(Path(temporary))
    config = read_config(config_path)
    frames, hashes = read_inputs(paths.PROCESSED)
    qc = json.loads((paths.PROCESSED / "labels_g0.json").read_text(encoding="utf-8"))
    version = model_version(hashes, config)
    directory = paths.MODELS / version
    g0_path = freeze_g0(directory, qc, hashes["labels"], config["eval_years"], version)
    g0_before = g0_path.read_bytes()
    events = frames["events"].to_dicts()
    labels, excluded = select_labels(frames["labels"], events, config)
    golden_ids = set(frames["labels"].filter(pl.col("is_golden"))["event_id"]) | {
        event["event_id"] for event in events if event.get("is_golden")
    }
    index = {event["event_id"]: event for event in events}
    golden_ids &= {
        event["event_id"]
        for event in events
        if event.get("start") and event.get("end") and event["end"] >= event["start"]
    }
    golden_labels = frames["labels"].filter(
        pl.col("event_id").is_in(golden_ids)
        & pl.col("is_primary")
        & (pl.col("daily_mean") > 0)
        & pl.col("available_at").is_not_null()
    )

    # 피처는 실제 공개일 검사 뒤에만 라벨과 결합하며 골든은 별도 평가 표로 분리한다.
    features, names = build_features(
        events,
        frames["labels"].to_dicts(),
        frames["region_daily"],
        set(labels["event_id"]) | set(golden_labels["event_id"]),
    )
    frame = labels.join(features, on="event_id", how="inner")
    golden_frame = golden_labels.join(features, on="event_id", how="inner")
    features.write_parquet(directory / "feature_availability.parquet")
    result = run_backtest(frame, names, index, config, g0_path, hashes["labels"], directory, golden_frame)
    selected_counts = Counter(
        (row["year"], index[row["event_id"]].get("type") or "미상") for row in labels.to_dicts()
    )
    result["selected_counts"] = [
        {"year": year, "type": kind, "n": count} for (year, kind), count in sorted(selected_counts.items())
    ]
    if g0_path.read_bytes() != g0_before:
        raise RuntimeError("백테스트 중 G0가 변경되었습니다")
    run_id = "bt-" + version
    report_directory = paths.REPORTS / "backtest" / run_id
    report_directory.mkdir(parents=True, exist_ok=True)
    if not result["points"]:
        (report_directory / "backtest.md").write_text(
            "평가 가능 연도 없음. 계약 수치 지표를 생성하지 않았습니다.\n"
            + json.dumps(result["folds"], ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        raise ValueError("모든 평가 연도를 건너뛰었습니다 — backtest.md의 표본 수·사유 확인 필요")

    # 주 모델 계약과 두 모델 상세 성적표는 같은 메모리 결과에서 함께 만든다.
    backtest = summary(result, run_id, version)
    missing = {name: features[name].null_count() for name in names}
    card = model_card(result, version, run_id, names, config, hashes["labels"], missing)
    validate_contract("backtest-summary", backtest)
    validate_contract("model-card", card)
    for path, value in (
        (report_directory / "backtest.json", backtest),
        (directory / "model_card.json", card),
        (paths.MODELS / "model_card.json", card),
    ):
        path.write_text(
            json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True, allow_nan=False) + "\n",
            encoding="utf-8",
        )
    (report_directory / "backtest.md").write_text(
        backtest_markdown(result, card, excluded, hashes), encoding="utf-8"
    )
    pl.DataFrame(result["points"], infer_schema_length=None).write_parquet(
        report_directory / "points.parquet"
    )
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
    }
    (directory / "run.json").write_text(
        json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8"
    )
    write_artifact_hashes(directory, report_directory)
    return {
        "modelVersion": version,
        "runId": run_id,
        "metrics": backtest["metrics"],
        "elapsedSeconds": elapsed,
        "reports": str(report_directory),
        "models": str(directory),
    }


# 재실행할 때마다 공유 모델과 레인 보고서의 전체 파일 해시를 함께 남긴다.
def write_artifact_hashes(directory: Path, reports: Path) -> None:
    hashes = {}
    for root, prefix in (
        (directory, f"models/{directory.name}"),
        (reports, f"reports/backtest/{reports.name}"),
    ):
        for path in sorted(root.rglob("*")):
            if path.is_file() and path.name != "artifact_hashes.json":
                hashes[f"{prefix}/{path.relative_to(root)}"] = hashlib.sha256(path.read_bytes()).hexdigest()
    hashes["models/model_card.json"] = hashlib.sha256(
        (directory.parent / "model_card.json").read_bytes()
    ).hexdigest()
    (directory / "artifact_hashes.json").write_text(
        json.dumps(hashes, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8"
    )


# 데이터 추가 뒤에도 같은 명령을 쓰도록 입력 위치는 공용 경로 설정을 따른다.
def main() -> None:
    parser = argparse.ArgumentParser(description="공개 시점 피처·G0 고정·롤링 백테스트")
    parser.add_argument("command", choices=["backtest"])
    parser.add_argument("--config", type=Path, default=paths.REPO_ROOT / "configs/model.yaml")
    arguments = parser.parse_args()
    print(json.dumps(execute(arguments.config), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
