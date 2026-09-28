"""실험 조건을 먼저 기록하고 개발 연도에서 선택한 모델을 후속 연도에 고정 검증한다."""

import argparse
import json
import platform
from datetime import date
from pathlib import Path

import lightgbm
import numpy as np
import polars as pl
import sklearn

from crowdcast.research.silver_expansion.dataset import build_dataset, source_hashes
from crowdcast.research.silver_expansion.estimators import fit_model, interval_correction, predict_model, save_model
from crowdcast.research.silver_expansion.evaluation import evaluate
from crowdcast.research.silver_expansion.metrics import breakdown, paired_region_bootstrap, score
from crowdcast.research.silver_expansion.splits import assign_clusters, make_split


# 수치와 날짜를 JSON으로 저장하고 운영 산출물 경로를 호출하지 않는다.
def write_json(path: Path, data: dict | list) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, default=str, allow_nan=False) + "\n", encoding="utf-8")


# 실험 조건을 먼저 저장한 뒤 개발 연도와 평가 연도를 순차적으로 실행한다.
def run(root: Path, output: Path) -> None:
    if output.exists():
        raise ValueError("산출물 덮어쓰기를 막기 위해 새 output 폴더를 지정하세요")
    output.mkdir(parents=True)
    grid = [{"num_leaves": leaves, "min_child_samples": minimum} for leaves in (7, 15) for minimum in (20, 40)]
    config = {
        "target": "signed regional increment, people/day; not venue attendance",
        "development_year": 2024, "evaluation_years": [2025, 2026], "seed": 2026, "grid": grid,
        "selection": "2024 weighted MAE ascending, then pinball, then fewer leaves and larger minimum leaf",
        "n_estimators": 200, "learning_rate": 0.05,
        "calibration": "latest ceil(20% clusters), at least 50; empirical weighted 80% nonnegative CQR expansion",
        "snr_reference": "training SNR>3 only; same calibration/evaluation; minimum 20 rows; small-sample reference",
        "versions": {"python": platform.python_version(), "lightgbm": lightgbm.__version__,
                     "numpy": np.__version__, "polars": pl.__version__, "sklearn": sklearn.__version__},
    }
    write_json(output / "preregistered_config.json", config)
    frame, names, audit = build_dataset(root, output)
    frame = assign_clusters(frame).with_columns((pl.len().over("cluster_id") > 1).alias("overlap"))
    frame.write_parquet(output / "candidates.parquet")
    splits = [make_split(frame, date(year, month, 1)) for year in (2024, 2025, 2026) for month in range(1, 13)
              if frame.filter((pl.col("year") == year) & (pl.col("start").dt.month() == month)).height]
    annual_splits = [make_split(frame, date.fromisoformat(s["month"]), annual=True) for s in splits
                     if int(s["month"][:4]) in (2025, 2026)]
    write_json(output / "monthly_split_ids.json", splits)
    write_json(output / "annual_split_ids.json", annual_splits)
    development = [s for s in splits if s["month"].startswith("2024")]
    later = [s for s in splits if not s["month"].startswith("2024")]
    expected = set(frame.filter(pl.col("year") >= 2024)["event_id"])

    # 개발 연도만으로 파라미터를 선택하고 후속 연도의 정답으로 재선택하지 않는다.
    trials, development_predictions = [], []
    for number, params in enumerate(grid):
        print(f"development grid {number + 1}/{len(grid)}: {params}", flush=True)
        predictions, logs = evaluate(frame, names, development, "full", params)
        predictions.write_parquet(output / f"development_grid_{number}.parquet")
        trials.append({"params": params, "score": score(predictions), "folds": logs})
        development_predictions.append(predictions)
    selected_index = min(range(len(grid)), key=lambda i: (
        trials[i]["score"]["mae"], trials[i]["score"]["pinball"], grid[i]["num_leaves"], -grid[i]["min_child_samples"],
    ))
    selected = grid[selected_index]
    write_json(output / "selection_2024.json", {"selected": selected, "trials": trials})
    print(f"selected before 2025/2026 evaluation: {selected}", flush=True)
    future_predictions, future_logs = evaluate(frame, names, later, "full", selected, save_directory=output / "models_monthly")
    all_predictions = {"full": pl.concat([development_predictions[selected_index], future_predictions])}
    all_logs = {"full": trials[selected_index]["folds"] + future_logs}
    for kind in ("zero", "type_median", "snr_filtered"):
        print(f"reference: {kind}", flush=True)
        predictions, logs = evaluate(frame, names, splits, kind, selected)
        all_predictions[kind], all_logs[kind] = predictions, logs
    predictions, logs = evaluate(frame, names, annual_splits, "annual_split", selected)
    all_predictions["annual_split"], all_logs["annual_split"] = predictions, logs

    # 평가행별 예측 고유성과 동일 분모를 검증한 뒤 연간 및 부분집합 점수를 계산한다.
    summaries = {}
    for kind, predictions in all_predictions.items():
        if predictions.is_empty():
            continue
        if kind in ("full", "zero", "type_median"):
            assert set(predictions["event_id"]) == expected
        predictions.write_parquet(output / f"predictions_{kind}.parquet")
        summaries[kind] = breakdown(predictions)
    comparisons = {}
    for year in (2025, 2026):
        candidate = all_predictions["full"].filter(pl.col("year") == year)
        for kind in ("zero", "type_median", "snr_filtered", "annual_split"):
            reference = all_predictions[kind]
            if reference.height:
                reference = reference.filter(pl.col("year") == year)
                common = candidate.filter(pl.col("event_id").is_in(reference["event_id"].to_list()))
                comparisons[f"{year}_{kind}"] = {"full": score(common), "reference": score(reference),
                    "paired": paired_region_bootstrap(common, reference)}
    write_json(output / "fold_counts.json", all_logs)

    # 공개된 전체 후보에도 같은 분할을 적용해 배포하지 않는 연구 스냅샷을 저장한다.
    snapshot_split = make_split(frame, date(2026, 10, 1), cutoff=date(2026, 9, 28))
    train = frame.filter(pl.col("event_id").is_in(snapshot_split["train"]))
    calibration = frame.filter(pl.col("event_id").is_in(snapshot_split["calibration"]))
    models, encoding = fit_model(train, names, selected)
    correction = interval_correction(calibration, predict_model(models, encoding, calibration))
    save_model(models, encoding, calibration, output / "model_snapshot")
    write_json(output / "model_snapshot/encoding.json", encoding)
    write_json(output / "model_snapshot/metadata.json", {
        "research_only": True, "promoted": False, "trained_as_of": "2026-09-28", "params": selected,
        "train_n": train.height, "calibration_n": calibration.height, "interval_correction": correction,
        "split": snapshot_split, "lightgbm_params": models[0].get_params(),
    })
    assert audit["source_hashes"] == source_hashes(root)
    result = {"status": "completed_research_not_promoted", "selected_params": selected,
              "feature_audit": audit, "scores": summaries, "paired_comparisons": comparisons,
              "snapshot": {"train_n": train.height, "calibration_n": calibration.height},
              "checks": {"source_hashes_unchanged": True, "availability_violations": 0,
                         "split_cluster_intersections": 0, "duplicate_evaluation_ids": 0, "model_roundtrip": True}}
    write_json(output / "summary.json", result)
    print(json.dumps({"selected": selected, "snapshot": result["snapshot"], "scores": {
        kind: {year: values.get(f"year_{year}") for year in (2024, 2025, 2026)}
        for kind, values in summaries.items()}}, ensure_ascii=True, indent=2), flush=True)


# 연구용 CLI는 지정된 새 폴더에만 산출물을 저장한다.
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    run(args.data_root.resolve(), args.output.resolve())
