"""지역 규모로 나눈 상대 척도 학습과 규모에 비례하는 구간 보정을 제공한다."""

import numpy as np
import polars as pl

from crowdcast.research.silver_expansion.estimators import (
    fit_model,
    predict_model,
    weighted_quantile,
    window_weights,
)


# 지역 평시 규모가 없거나 0 이하이면 학습 자료에서 정한 대체값을 쓴다.
def scale_of(frame: pl.DataFrame, fill: float | None) -> np.ndarray:
    if fill is None:
        return np.ones(frame.height)
    values = frame["region_daily_mean"].to_numpy().astype(float)
    return np.where(np.isfinite(values) & (values > 0), values, fill)


# 상대 척도 변형은 타깃만 나눠 학습하고 입력·가중치·설정은 v1과 같게 둔다.
def fit_variant(train: pl.DataFrame, names: list[str], params: dict, *, relative: bool) -> tuple[list, dict]:
    fill = None
    if relative:
        observed = train.filter(pl.col("region_daily_mean").is_not_null() & (pl.col("region_daily_mean") > 0))
        fill = float(observed["region_daily_mean"].median())
        train = train.with_columns(pl.Series("target", train["target"].to_numpy() / scale_of(train, fill)))
    models, encoding = fit_model(train, names, params)
    encoding["scale_fill"] = fill
    return models, encoding


# 상대 척도 예측은 같은 규모를 다시 곱해 원단위(명/일)로 돌려준다.
def predict_variant(models: list, encoding: dict, frame: pl.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    scale = scale_of(frame, encoding["scale_fill"])
    return predict_model(models, encoding, frame) * scale[:, None], scale


# 이탈 점수를 규모로 나눠 80% 분위수를 구하므로 가산 보정(규모 1)은 v1과 같다.
def interval_scale_correction(calibration: pl.DataFrame, predictions: np.ndarray, scale: np.ndarray) -> float:
    y = calibration["target"].to_numpy()
    scores = np.maximum.reduce([predictions[:, 0] - y, y - predictions[:, 2], np.zeros(len(y))]) / scale
    return weighted_quantile(scores, window_weights(calibration), 0.8)
