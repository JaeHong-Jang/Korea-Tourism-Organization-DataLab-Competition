"""2023~24 학습 · 2025.1~8 검증 · 2025.9~2026.8 테스트의 고정 분할로 한 번 학습해 판정한다."""

import argparse
import hashlib
import json
import platform
from datetime import date
from math import ceil
from pathlib import Path

import lightgbm
import polars as pl

from crowdcast.research.silver_expansion.dataset import build_dataset, source_hashes
from crowdcast.research.silver_expansion.estimators import save_model, weighted_quantile, window_weights
from crowdcast.research.silver_expansion.evaluation import evaluate
from crowdcast.research.silver_expansion.metrics import breakdown, paired_region_bootstrap, score
from crowdcast.research.silver_expansion.splits import assign_clusters, validate_split
from crowdcast.research.silver_v2.estimators import fit_variant
from crowdcast.research.silver_v2.evaluation import evaluate_variant
from crowdcast.research.silver_v2.features import PRIOR_NAMES, add_prior_features

CUTOFF = date(2024, 12, 18)
PERIODS = {"validation": (date(2025, 1, 1), date(2025, 8, 31)), "test": (date(2025, 9, 1), date(2026, 8, 31))}
VARIANTS = [
    ("base", False, False),
    ("prior", True, False),
    ("relative", False, True),
    ("prior_relative", True, True),
]


# 날짜·수치를 JSON으로 남긴다.
def write_json(path: Path, data: dict | list) -> None:
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2, default=str, allow_nan=False) + "\n", encoding="utf-8"
    )


# 기준일까지 공개가 끝난 2023~24 군집만 학습 후보로 두고 최근 20% 군집을 보정으로 뗀다.
def holdout_splits(frame: pl.DataFrame) -> tuple[dict, dict, dict]:
    rows = {
        name: frame.filter((pl.col("start") >= a) & (pl.col("start") <= b))
        for name, (a, b) in PERIODS.items()
    }
    evaluation_clusters = set(rows["validation"]["cluster_id"]) | set(rows["test"]["cluster_id"])
    candidates, unpublished, boundary = [], 0, 0
    for group in frame.filter(pl.col("year") <= 2024).partition_by("cluster_id"):
        past = group.filter(pl.col("available_at") <= CUTOFF)
        if group["cluster_id"][0] in evaluation_clusters or (past.height and past.height != group.height):
            boundary += group.height
        elif not past.height:
            unpublished += group.height
        else:
            candidates.append(group)
    candidates.sort(key=lambda g: (g["available_at"].max(), g["end"].max(), g["event_id"].min()))
    n_cal = min(len(candidates), max(50, ceil(len(candidates) * 0.2)))
    training, calibration = candidates[:-n_cal], candidates[-n_cal:]
    base = {
        "cutoff": CUTOFF,
        "train": [i for g in training for i in g["event_id"]],
        "calibration": [i for g in calibration for i in g["event_id"]],
        "train_clusters": len(training),
        "calibration_clusters": len(calibration),
        "excluded_boundary": [],
    }
    splits = {
        name: {**base, "month": name, "evaluation": rows[name]["event_id"].to_list()} for name in PERIODS
    }
    for split in splits.values():
        validate_split(frame, split)
    counts = {
        "train": len(base["train"]),
        "calibration": len(base["calibration"]),
        "validation": rows["validation"].height,
        "test": rows["test"].height,
        "excluded_unpublished_at_cutoff": unpublished,
        "excluded_partial_or_shared_cluster": boundary,
    }
    return splits["validation"], splits["test"], counts


# 사전 등록한 H1~H5를 검증·테스트 점수로 판정한다.
def judge(validation: dict, test: dict, large: dict, holiday: dict) -> dict:
    checks = [
        {
            "id": "H1",
            "values": {k: validation[k] for k in ("model", "type_median")},
            "passed": validation["model"]["mae"] < validation["type_median"]["mae"]
            and validation["model"]["pinball"] < validation["type_median"]["pinball"],
        },
        {
            "id": "H2",
            "values": {k: test[k] for k in ("model", "type_median", "v1_monthly")},
            "passed": test["model"]["mae"] < test["type_median"]["mae"]
            and test["model"]["mae"] < test["v1_monthly"]["mae"],
        },
        {
            "id": "H3",
            "values": large,
            "passed": large["model"]["coverage"] >= 0.5
            and large["model"]["mae"] < large["v1_monthly"]["mae"],
        },
        {"id": "H4", "values": holiday, "passed": holiday["model"]["mae"] <= holiday["v1_monthly"]["mae"]},
        {
            "id": "H5",
            "values": {"coverage": test["model"]["coverage"]},
            "passed": 0.75 <= test["model"]["coverage"] <= 0.90,
        },
    ]
    return {"checks": checks, "adopted": all(c["passed"] for c in checks)}


# 설정 기록 → 16개 설정 검증 선택 → 같은 모델로 테스트 → 기준선·월별 방식과 비교한다.
def run(root: Path, output: Path, preregistration: Path, v1_predictions: Path, v2_predictions: Path) -> None:
    if output.exists():
        raise ValueError("산출물 덮어쓰기를 막기 위해 새 output 폴더를 지정하세요")
    output.mkdir(parents=True)
    grid = [
        {"num_leaves": leaves, "min_child_samples": minimum} for leaves in (7, 15) for minimum in (20, 40)
    ]
    write_json(
        output / "preregistered_config.json",
        {
            "preregistration_sha256": hashlib.sha256(preregistration.read_bytes()).hexdigest(),
            "cutoff": CUTOFF,
            "periods": PERIODS,
            "variants": VARIANTS,
            "grid": grid,
            "versions": {"python": platform.python_version(), "lightgbm": lightgbm.__version__},
        },
    )
    frame, names, audit = build_dataset(root, output)
    frame = assign_clusters(frame).with_columns((pl.len().over("cluster_id") > 1).alias("overlap"))
    frame, prior_audit = add_prior_features(frame)
    frame.write_parquet(output / "candidates.parquet")
    validation_split, test_split, counts = holdout_splits(frame)
    write_json(
        output / "split_ids.json", {"validation": validation_split, "test": test_split, "counts": counts}
    )

    # 16개 설정을 검증셋에서만 비교하고, 선택을 저장한 뒤에야 테스트를 예측한다.
    trials, predictions_by_trial = [], []
    for order, (variant, prior, relative) in enumerate(VARIANTS):
        inputs = names + PRIOR_NAMES if prior else names
        for params in grid:
            predictions, _ = evaluate_variant(
                frame, inputs, [validation_split], variant, params, relative=relative
            )
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
    write_json(output / "selection_validation.json", {"selected": trials[best], "trials": trials})
    variant, prior, relative = VARIANTS[trials[best]["order"]]
    inputs, params = (names + PRIOR_NAMES if prior else names), trials[best]["params"]
    print(f"selected on validation: {variant} {params}", flush=True)
    kinds = {"model": {"validation": predictions_by_trial[best]}}
    kinds["model"]["test"], _ = evaluate_variant(
        frame, inputs, [test_split], "model", params, relative=relative
    )
    for kind in ("zero", "type_median", "snr_filtered"):
        kinds[kind] = {
            s["month"]: evaluate(frame, names, [s], kind, params)[0] for s in (validation_split, test_split)
        }
    test_ids = test_split["evaluation"]
    for kind, path in (("v1_monthly", v1_predictions), ("v2_monthly", v2_predictions)):
        kinds[kind] = {"test": pl.read_parquet(path).filter(pl.col("event_id").is_in(test_ids))}
    for kind, parts in kinds.items():
        for part, predictions in parts.items():
            if kind in ("model", "zero", "type_median", "v1_monthly", "v2_monthly"):
                expected = validation_split["evaluation"] if part == "validation" else test_ids
                assert set(predictions["event_id"]) == set(expected), f"{kind} {part} 행 불일치"
            predictions.write_parquet(output / f"predictions_{kind}_{part}.parquet")

    # 큰 양수 기준은 v1·v2와 같은 2023 가중 90% 분위수다.
    early = frame.filter(pl.col("year") == 2023)
    large_cut = weighted_quantile(early["target"].to_numpy(), window_weights(early), 0.9)
    validation = {k: score(p["validation"]) for k, p in kinds.items() if "validation" in p}
    test = {k: score(p["test"]) for k, p in kinds.items()}
    large = {k: score(p["test"].filter(pl.col("target") >= large_cut)) for k, p in kinds.items()}
    holiday = {k: score(p["test"].filter(pl.col("holiday"))) for k, p in kinds.items()}
    verdict = judge(validation, test, large, holiday)
    comparisons = {
        ref: paired_region_bootstrap(kinds["model"]["test"], kinds[ref]["test"])
        for ref in ("type_median", "zero", "v1_monthly", "v2_monthly")
    }

    # 선택한 설정의 고정 모델과 실제 입력 목록을 저장한다.
    train = frame.filter(pl.col("event_id").is_in(test_split["train"]))
    models, encoding = fit_variant(train, inputs, params, relative=relative)
    save_model(models, encoding, train, output / "model")
    write_json(output / "model/encoding.json", encoding)
    # 중앙값 모델의 분할 이득을 비율로 남긴다. 절대값은 손실 단위라 비교에 쓰지 않는다.
    gains = models[1].booster_.feature_importance("gain")
    importance = {
        name: round(float(gain / gains.sum()), 4) for name, gain in zip(encoding["names"], gains, strict=True)
    }
    assert audit["source_hashes"] == source_hashes(root)
    write_json(
        output / "summary.json",
        {
            "status": "adoption_criteria_met" if verdict["adopted"] else "adoption_criteria_not_met",
            "selected": {"variant": variant, "params": params},
            "counts": counts,
            "criteria": verdict,
            "large_positive_threshold": large_cut,
            "validation": validation,
            "test": test,
            "test_large_positive": large,
            "test_holiday": holiday,
            "test_breakdown": {
                k: breakdown(p["test"]) for k, p in kinds.items() if "month" in p["test"].columns
            },
            "paired_comparisons": comparisons,
            "inputs": inputs,
            "model_inputs_after_encoding": encoding["names"],
            "p50_gain_importance": dict(sorted(importance.items(), key=lambda x: -x[1])),
            "prior_feature_audit": prior_audit,
            "checks": {"source_hashes_unchanged": True, "prior_availability_violations": 0},
        },
    )
    print(
        json.dumps(
            {"status": verdict["adopted"], "checks": [(c["id"], c["passed"]) for c in verdict["checks"]]}
        )
    )


# 연구용 CLI는 새 폴더에만 쓴다.
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    for name in ("--data-root", "--output", "--preregistration", "--v1-predictions", "--v2-predictions"):
        parser.add_argument(name, type=Path, required=True)
    a = parser.parse_args()
    run(
        a.data_root.resolve(),
        a.output.resolve(),
        a.preregistration.resolve(),
        a.v1_predictions.resolve(),
        a.v2_predictions.resolve(),
    )
