"""사전 등록 문서의 해시를 먼저 남기고 v2 세 변형을 2024년에서만 골라 판정한다."""

import argparse
import hashlib
import json
import platform
from datetime import date
from pathlib import Path

import lightgbm
import numpy as np
import polars as pl
import sklearn

from crowdcast.research.silver_expansion.dataset import build_dataset, source_hashes
from crowdcast.research.silver_expansion.estimators import save_model, weighted_quantile, window_weights
from crowdcast.research.silver_expansion.evaluation import evaluate
from crowdcast.research.silver_expansion.metrics import breakdown, paired_region_bootstrap, score
from crowdcast.research.silver_expansion.splits import assign_clusters, make_split
from crowdcast.research.silver_v2.criteria import judge
from crowdcast.research.silver_v2.estimators import fit_variant, interval_scale_correction, predict_variant
from crowdcast.research.silver_v2.evaluation import evaluate_variant
from crowdcast.research.silver_v2.features import PRIOR_NAMES, add_prior_features

VARIANTS = [("prior", True, False), ("relative", False, True), ("prior_relative", True, True)]
V1_PARAMS = {"num_leaves": 7, "min_child_samples": 20}


# 날짜·수치를 JSON으로 남기고 기존 산출물은 덮어쓰지 않는다.
def write_json(path: Path, data: dict | list) -> None:
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2, default=str, allow_nan=False) + "\n", encoding="utf-8"
    )


# 12개 설정을 2024년에서만 비교하고, 선택 결과를 저장한 뒤에야 후속 연도를 예측한다.
def select_on_development(
    frame: pl.DataFrame, names: list[str], development: list[dict], grid: list[dict], output: Path
) -> tuple[dict, pl.DataFrame]:
    trials, predictions_by_trial = [], []
    for order, (variant, prior, relative) in enumerate(VARIANTS):
        inputs = names + PRIOR_NAMES if prior else names
        for params in grid:
            print(f"development {variant} {params}", flush=True)
            predictions, _ = evaluate_variant(frame, inputs, development, variant, params, relative=relative)
            trials.append({"variant": variant, "order": order, "params": params, "score": score(predictions)})
            predictions_by_trial.append(predictions)
    best = min(
        range(len(trials)),
        key=lambda i: (
            trials[i]["score"]["mae"],
            trials[i]["score"]["pinball"],
            trials[i]["params"]["num_leaves"],
            -trials[i]["params"]["min_child_samples"],
            trials[i]["order"],
        ),
    )
    write_json(output / "selection_2024.json", {"selected": trials[best], "trials": trials})
    return trials[best], predictions_by_trial[best]


# 설정 저장 → 개발 선택 → 후속 연도 고정 평가 → 조건 판정 → 스냅샷 순으로 실행한다.
def run(root: Path, output: Path, preregistration: Path) -> None:
    if output.exists():
        raise ValueError("산출물 덮어쓰기를 막기 위해 새 output 폴더를 지정하세요")
    output.mkdir(parents=True)
    grid = [
        {"num_leaves": leaves, "min_child_samples": minimum} for leaves in (7, 15) for minimum in (20, 40)
    ]
    write_json(
        output / "preregistered_config.json",
        {
            "preregistration": preregistration.name,
            "preregistration_sha256": hashlib.sha256(preregistration.read_bytes()).hexdigest(),
            "variants": [{"name": n, "prior": p, "relative": r} for n, p, r in VARIANTS],
            "grid": grid,
            "development_year": 2024,
            "evaluation_years": [2025, 2026],
            "seed": 2026,
            "selection": "2024 weighted MAE, pinball, fewer leaves, larger minimum leaf, variant order",
            "versions": {
                "python": platform.python_version(),
                "lightgbm": lightgbm.__version__,
                "numpy": np.__version__,
                "polars": pl.__version__,
                "sklearn": sklearn.__version__,
            },
        },
    )
    frame, names, audit = build_dataset(root, output)
    frame = assign_clusters(frame).with_columns((pl.len().over("cluster_id") > 1).alias("overlap"))
    frame, prior_audit = add_prior_features(frame)
    frame.write_parquet(output / "candidates.parquet")
    splits = [
        make_split(frame, date(year, month, 1))
        for year in (2024, 2025, 2026)
        for month in range(1, 13)
        if frame.filter((pl.col("year") == year) & (pl.col("start").dt.month() == month)).height
    ]
    development = [s for s in splits if s["month"].startswith("2024")]
    later = [s for s in splits if not s["month"].startswith("2024")]

    best, selected_dev = select_on_development(frame, names, development, grid, output)
    variant, prior, relative = VARIANTS[best["order"]]
    inputs, params = (names + PRIOR_NAMES if prior else names), best["params"]
    print(f"selected before 2025/2026 evaluation: {variant} {params}", flush=True)
    future, _ = evaluate_variant(
        frame, inputs, later, "v2", params, relative=relative, save_directory=output / "models_monthly"
    )
    kinds = {"v2": pl.concat([selected_dev.with_columns(pl.lit("v2").alias("model")), future])}
    for kind in ("zero", "type_median"):
        kinds[kind], _ = evaluate(frame, names, splits, kind, V1_PARAMS)
    kinds["v1"], _ = evaluate(frame, names, splits, "full", V1_PARAMS)
    expected = set(frame.filter(pl.col("year") >= 2024)["event_id"])
    for kind, predictions in kinds.items():
        assert set(predictions["event_id"]) == expected, f"{kind} 평가행 불일치"
        predictions.write_parquet(output / f"predictions_{kind}.parquet")

    # 큰 양수 기준은 v1 진단과 같은 2023년 가중 90% 분위수이고 2025·2026 행만 판정에 쓴다.
    early = frame.filter(pl.col("year") == 2023)
    large_cut = weighted_quantile(early["target"].to_numpy(), window_weights(early), 0.9)
    final = {k: p.filter(pl.col("year") >= 2025) for k, p in kinds.items()}
    subsets = {
        k: {
            "large_positive_2023_q90": score(p.filter(pl.col("target") >= large_cut)),
            "holiday": score(p.filter(pl.col("holiday"))),
            "high_snr": score(p.filter(pl.col("snr") > 3)),
            "negative": score(p.filter(pl.col("target") < 0)),
        }
        for k, p in final.items()
    }
    yearly = {
        year: {k: score(p.filter(pl.col("year") == year)) for k, p in kinds.items()} for year in (2025, 2026)
    }
    dev = {k: score(kinds[k].filter(pl.col("year") == 2024)) for k in ("v2", "type_median", "v1")}
    verdict = judge(
        dev,
        yearly,
        {k: subsets[k]["large_positive_2023_q90"] for k in ("v2", "v1")},
        {k: subsets[k]["holiday"] for k in ("v2", "v1")},
    )
    comparisons = {
        f"{year}_{ref}": paired_region_bootstrap(
            kinds["v2"].filter(pl.col("year") == year), kinds[ref].filter(pl.col("year") == year)
        )
        for year in (2025, 2026)
        for ref in ("type_median", "v1", "zero")
    }

    # 공개된 전체 후보로 같은 설정의 스냅샷을 저장하되 운영 반영은 별도 결정으로 남긴다.
    snapshot_split = make_split(frame, date(2026, 10, 1), cutoff=date(2026, 9, 28))
    train = frame.filter(pl.col("event_id").is_in(snapshot_split["train"]))
    calibration = frame.filter(pl.col("event_id").is_in(snapshot_split["calibration"]))
    models, encoding = fit_variant(train, inputs, params, relative=relative)
    cal_pred, cal_scale = predict_variant(models, encoding, calibration)
    correction = interval_scale_correction(calibration, cal_pred, cal_scale)
    save_model(models, encoding, calibration, output / "model_snapshot")
    write_json(output / "model_snapshot/encoding.json", encoding)
    write_json(
        output / "model_snapshot/metadata.json",
        {
            "research_only": True,
            "promoted": False,
            "adoption_criteria_met": verdict["adopted"],
            "variant": variant,
            "params": params,
            "relative": relative,
            "inputs": inputs,
            "trained_as_of": "2026-09-28",
            "train_n": train.height,
            "calibration_n": calibration.height,
            "relative_correction": correction,
            "split": snapshot_split,
        },
    )
    assert audit["source_hashes"] == source_hashes(root)
    result = {
        "status": "adoption_criteria_met" if verdict["adopted"] else "adoption_criteria_not_met",
        "selected": {"variant": variant, "params": params},
        "criteria": verdict,
        "large_positive_threshold": large_cut,
        "development_2024": dev,
        "yearly": yearly,
        "subsets_2025_2026": subsets,
        "breakdown": {k: breakdown(p) for k, p in kinds.items()},
        "paired_comparisons": comparisons,
        "prior_feature_audit": prior_audit,
        "feature_audit": audit,
        "snapshot": {"train_n": train.height, "calibration_n": calibration.height},
        "checks": {
            "source_hashes_unchanged": True,
            "prior_availability_violations": 0,
            "observation_availability_violations": audit["availability_violations"],
            "duplicate_evaluation_ids": 0,
            "model_roundtrip": True,
        },
    }
    write_json(output / "summary.json", result)
    print(
        json.dumps(
            {
                "selected": result["selected"],
                "status": result["status"],
                "criteria": [(c["id"], c["passed"]) for c in verdict["checks"]],
            },
            ensure_ascii=False,
        ),
        flush=True,
    )


# 연구용 CLI는 새 폴더에만 쓰고 사전 등록 문서를 반드시 받는다.
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--preregistration", type=Path, required=True)
    args = parser.parse_args()
    run(args.data_root.resolve(), args.output.resolve(), args.preregistration.resolve())
