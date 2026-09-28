"""저장된 예측만 읽어 부분집합·신규 행사 추정·실행 불변식을 점검한다."""

import argparse
import json
import re
import unicodedata
from datetime import date
from pathlib import Path

import numpy as np
import polars as pl

from crowdcast.research.silver_expansion.dataset import source_hashes
from crowdcast.research.silver_expansion.estimators import weighted_quantile, window_weights
from crowdcast.research.silver_expansion.metrics import breakdown, score
from crowdcast.research.silver_expansion.splits import validate_split


# 행사 시리즈는 연도·회차를 뺀 이름과 지역으로 임시 연결하며 확정 매칭으로 보지 않는다.
def series_key(row: dict) -> str:
    name = unicodedata.normalize("NFKC", row["name"])
    name = re.sub(r"(?:19|20)\d{2}년?", "", name)
    name = re.sub(r"(?:제\s*)?\d+\s*회", "", name)
    name = re.sub(r"[\W_]+", "", name)
    return f"{row['sigungu_code']}:{name}"


# 산출물을 재학습하지 않고 기존 피처·분할·실제 학습 수와 대조한다.
def verify(root: Path, output: Path) -> dict:
    candidates = pl.read_parquet(output / "candidates.parquet")
    summary = json.loads((output / "summary.json").read_text(encoding="utf-8"))
    assert summary["feature_audit"]["source_hashes"] == source_hashes(root)
    assert candidates.height == 1804 and candidates["event_id"].n_unique() == 1804
    assert candidates.filter(pl.col("target") < 0).height == 465
    old_features = pl.read_parquet(root / "data/processed/features.parquet")
    common = candidates.join(old_features, on="event_id", suffix="_old")
    parity = {"common_rows": common.height}
    for name in ("region_daily_mean", "nonlocal_share", "weekend_ratio"):
        a, b = common[name].to_numpy(), common[f"{name}_old"].to_numpy()
        np.testing.assert_allclose(a, b, rtol=1e-12, atol=1e-8, equal_nan=True)
        parity[name] = float(np.nanmax(np.abs(a - b)))
    splits = json.loads((output / "monthly_split_ids.json").read_text(encoding="utf-8"))
    eval_ids = []
    expected_starts = {"2024-01-01": (294, 78), "2025-01-01": (624, 162), "2026-01-01": (1135, 282)}
    for split in splits:
        split["cutoff"] = date.fromisoformat(split["cutoff"])
        validate_split(candidates, split)
        eval_ids.extend(split["evaluation"])
        if split["month"] in expected_starts:
            assert (len(split["train"]), len(split["calibration"])) == expected_starts[split["month"]]
    assert len(eval_ids) == len(set(eval_ids)) == 1432

    # 큰 양수 기준은 2023년 과거 분포에서 정하고 이후 성적의 설명에만 사용한다.
    original_labels = pl.read_parquet(root / "data/processed/labels.parquet")
    primary_ids = original_labels.filter(pl.col("is_primary") & pl.col("usable_for_training")
                                         & (pl.col("label_tier") == "silver"))["event_id"].to_list()
    early = candidates.filter(pl.col("year") == 2023)
    large_cut = weighted_quantile(early["target"].to_numpy(), window_weights(early), 0.9)
    rows = candidates.to_dicts()
    key_by_id = {r["event_id"]: series_key(r) for r in rows}
    seen = {r["event_id"]: any(key_by_id[h["event_id"]] == key_by_id[r["event_id"]]
            and h["available_at"] <= r["as_of"] for h in rows) for r in rows}
    models = {}
    for kind in ("full", "zero", "type_median", "snr_filtered", "annual_split"):
        predictions = pl.read_parquet(output / f"predictions_{kind}.parquet")
        assert predictions.height == predictions["event_id"].n_unique()
        final = predictions.filter(pl.col("year") >= 2025)
        assert final.height == 993
        result = breakdown(final)
        result["original_primary_usable_silver"] = score(final.filter(pl.col("event_id").is_in(primary_ids)))
        result["large_positive_2023_q90"] = score(final.filter(pl.col("target") >= large_cut))
        known_ids = [key for key, value in seen.items() if value]
        result["prior_series_heuristic"] = score(final.filter(pl.col("event_id").is_in(known_ids)))
        result["no_prior_series_heuristic"] = score(final.filter(~pl.col("event_id").is_in(known_ids)))
        models[kind] = result
    result = {"source_hashes_unchanged": True, "split_assertions": True, "evaluation_ids_unique": True,
              "agreed_initial_counts_match": True, "feature_parity": parity,
              "large_positive_threshold": large_cut,
              "series_caveat": "name+region heuristic only; no manually verified festival series labels",
              "models_2025_2026_only": models}
    (output / "verification.json").write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k != "models_2025_2026_only"}, ensure_ascii=True, indent=2))
    return result


# 검증 도구는 예측 산출물을 읽고 진단 JSON만 새로 저장한다.
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    verify(args.data_root, args.output)
