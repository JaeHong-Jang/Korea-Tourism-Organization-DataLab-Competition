"""월별 예측을 합쳐 관측 구간 가중 오차와 부분집합 성능을 계산한다."""

import numpy as np
import polars as pl

from crowdcast.research.silver_expansion.estimators import weighted_quantile, window_weights


# 매월 점수의 평균 대신 합쳐진 관측 구간마다 같은 총 영향력을 부여한다.
def score(frame: pl.DataFrame) -> dict:
    if not frame.height:
        return {"n": 0}
    weights = window_weights(frame)
    y, p50 = frame["target"].to_numpy(), frame["p50"].to_numpy()
    residual = p50 - y
    pinball = []
    for alpha, name in ((0.1, "p10"), (0.5, "p50"), (0.9, "p90")):
        error = y - frame[name].to_numpy()
        pinball.append(float(np.average(np.maximum(alpha * error, (alpha - 1) * error), weights=weights)))
    width = (frame["upper"] - frame["lower"]).to_numpy()
    covered = ((frame["lower"].to_numpy() <= y) & (y <= frame["upper"].to_numpy())).astype(float)
    return {
        "n": frame.height, "windows": frame["window_id"].n_unique(),
        "mae": float(np.average(np.abs(residual), weights=weights)),
        "median_absolute_error": weighted_quantile(np.abs(residual), weights, 0.5),
        "rmse": float(np.sqrt(np.average(residual ** 2, weights=weights))),
        "bias": float(np.average(residual, weights=weights)),
        "event_row_mae": float(np.abs(residual).mean()), "pinball": float(np.mean(pinball)),
        "coverage": float(np.average(covered, weights=weights)),
        "mean_width": float(np.average(width, weights=weights)),
        "median_width": weighted_quantile(width, weights, 0.5),
    }


# 전체·연도·신호 크기·명절·유형·겹침을 동일한 채점 함수로 진단한다.
def breakdown(frame: pl.DataFrame) -> dict:
    result = {"all": score(frame)}
    subsets = {"low_snr": pl.col("snr") <= 3, "high_snr": pl.col("snr") > 3,
               "negative": pl.col("target") < 0, "positive": pl.col("target") > 0,
               "holiday": pl.col("holiday"), "nonholiday": ~pl.col("holiday"),
               "overlap": pl.col("overlap"), "nonoverlap": ~pl.col("overlap")}
    for year in frame["year"].unique():
        subsets[f"year_{year}"] = pl.col("year") == year
    for event_type in frame["event_type"].unique():
        subsets[f"type_{event_type}"] = pl.col("event_type") == event_type
    result.update({name: score(frame.filter(condition)) for name, condition in subsets.items()})
    result["monthly"] = {month: score(frame.filter(pl.col("month") == month)) for month in sorted(frame["month"].unique())}
    return result


# 공통 행사에서 지역 단위 재표집으로 MAE 차이의 불확실성을 보조 진단한다.
def paired_region_bootstrap(candidate: pl.DataFrame, reference: pl.DataFrame) -> dict:
    paired = candidate.join(reference.select("event_id", pl.col("p50").alias("reference")), on="event_id")
    if not paired.height:
        return {"n": 0}
    paired = paired.with_columns(((pl.col("p50") - pl.col("target")).abs()
                                 - (pl.col("reference") - pl.col("target")).abs()).alias("difference"))
    windows = paired.group_by("sigungu_code", "window_id").agg(pl.col("difference").mean())
    regions = windows.group_by("sigungu_code").agg(pl.col("difference").sum().alias("sum"), pl.len().alias("n"))
    sums, counts = regions["sum"].to_numpy(), regions["n"].to_numpy()
    rng = np.random.default_rng(2026)
    samples = rng.integers(0, len(sums), size=(1000, len(sums)))
    differences = sums[samples].sum(axis=1) / counts[samples].sum(axis=1)
    return {"n": paired.height, "regions": len(sums), "candidate_minus_reference_mae": float(sums.sum() / counts.sum()),
            "bootstrap_95_interval": np.quantile(differences, [0.025, 0.975]).tolist(),
            "interpretation": "negative favors candidate; region bootstrap does not remove shared temporal dependence"}
