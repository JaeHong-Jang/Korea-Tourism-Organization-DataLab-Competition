"""부호를 유지한 분위수 모델과 학습 전용 인코딩·구간 보정을 제공한다."""

from pathlib import Path

import lightgbm as lgb
import numpy as np
import polars as pl

from crowdcast.models.compat import quantile_regressor


# 같은 관측 구간의 여러 행사에 총 가중치 1을 나누어 준다.
def window_weights(frame: pl.DataFrame) -> np.ndarray:
    return frame.select((1.0 / pl.len().over("window_id")).alias("weight"))["weight"].to_numpy()


# 보정·기준선 모두 정렬된 값의 누적 가중치로 경험 분위수를 계산한다.
def weighted_quantile(values: np.ndarray, weights: np.ndarray, alpha: float) -> float:
    if not len(values) or not np.isfinite(values).all() or np.any(weights <= 0):
        raise ValueError("분위수 입력은 유한한 값과 양수 가중치여야 합니다")
    order = np.argsort(values, kind="stable")
    position = np.searchsorted(np.cumsum(weights[order]), alpha * weights.sum(), side="left")
    return float(values[order[min(position, len(order) - 1)]])


# 대체값·결측 표시·상수 제거를 학습 자료에서만 결정한다.
def fit_encoding(frame: pl.DataFrame, names: list[str]) -> dict:
    fill = {n: float(frame[n].median()) if frame[n].drop_nulls().len() else 0.0 for n in names}
    encoding = {"source_names": names, "fill": fill}
    matrix, expanded = design_matrix(frame, encoding, select=False)
    keep = np.ptp(matrix, axis=0) > 0
    if not keep.any():
        keep[0] = True
    encoding.update({"keep": keep.tolist(), "names": [n for n, yes in zip(expanded, keep) if yes]})
    return encoding


# 학습에서 저장한 열 선택과 결측 대체를 모든 후속 예측에 동일하게 적용한다.
def design_matrix(frame: pl.DataFrame, encoding: dict, *, select: bool = True) -> tuple[np.ndarray, list[str]]:
    columns, names = [], []
    for name in encoding["source_names"]:
        columns.extend([frame[name].fill_null(encoding["fill"][name]).to_numpy(),
                        frame[name].is_null().cast(pl.Float64).to_numpy()])
        names.extend([name, f"{name}_missing"])
    matrix = np.column_stack(columns)
    if select:
        return matrix[:, encoding["keep"]], encoding["names"]
    return matrix, names


# 세 개의 얕은 분위수 모델을 원단위 signed 타깃과 관측 가중치로 학습한다.
def fit_model(train: pl.DataFrame, names: list[str], params: dict) -> tuple[list, dict]:
    encoding = fit_encoding(train, names)
    x, feature_names = design_matrix(train, encoding)
    y, weights = train["target"].to_numpy(), window_weights(train)
    models = []
    for alpha in (0.1, 0.5, 0.9):
        model = quantile_regressor(alpha, random_state=2026, n_estimators=200, learning_rate=0.05, **params)
        model.fit(x, y, sample_weight=weights, feature_name=feature_names)
        models.append(model)
    return models, encoding


# 원단위 예측값은 음수도 보존하고 세 분위수가 교차하면 순서만 바로잡는다.
def predict_model(models: list, encoding: dict, frame: pl.DataFrame) -> np.ndarray:
    x, _ = design_matrix(frame, encoding)
    values = np.column_stack([model.booster_.predict(x, num_threads=1) for model in models])
    return np.sort(values, axis=1)


# 모델 저장과 복원 결과를 비교해 별도 연구 모델의 재현성을 확인한다.
def save_model(models: list, encoding: dict, frame: pl.DataFrame, directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    x, _ = design_matrix(frame, encoding)
    for alpha, model in zip((10, 50, 90), models):
        path = directory / f"p{alpha}.txt"
        model.booster_.save_model(str(path))
        restored = lgb.Booster(model_file=str(path))
        np.testing.assert_allclose(model.booster_.predict(x, num_threads=1), restored.predict(x, num_threads=1), rtol=0, atol=0)


# 학습 자료의 유형별 분위수를 쓰되 소표본 유형은 전체 분포로 대체한다.
def baseline_predictions(train: pl.DataFrame, frame: pl.DataFrame, kind: str) -> np.ndarray:
    if kind == "zero":
        return np.zeros((frame.height, 3))
    weights, y = window_weights(train), train["target"].to_numpy()
    fallback = [weighted_quantile(y, weights, a) for a in (0.1, 0.5, 0.9)]
    groups = {}
    for event_type in train["event_type"].unique():
        subset = train.filter(pl.col("event_type") == event_type)
        if subset.height >= 20:
            groups[event_type] = [weighted_quantile(subset["target"].to_numpy(), window_weights(subset), a)
                                  for a in (0.1, 0.5, 0.9)]
    return np.array([groups.get(t, fallback) for t in frame["event_type"]])


# 보정 전용 자료의 80% 가중 이탈점수로 구간만 넓히고 중앙값은 바꾸지 않는다.
def interval_correction(calibration: pl.DataFrame, predictions: np.ndarray) -> float:
    y = calibration["target"].to_numpy()
    scores = np.maximum.reduce([predictions[:, 0] - y, y - predictions[:, 2], np.zeros(len(y))])
    return weighted_quantile(scores, window_weights(calibration), 0.8)
