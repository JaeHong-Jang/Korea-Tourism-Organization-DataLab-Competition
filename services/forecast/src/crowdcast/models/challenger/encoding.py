"""고정된 공변량과 유형·시도 계층을 학습 구간만으로 인코딩한다."""

from typing import Any

import numpy as np
import polars as pl
from crowdcast.features.availability import Feature, check_availability

# 중복 발표치와 서열 없는 범주를 회귀 기울기에 넣지 않고 규모·지역 공변량만 선택한다.
COVARIATES = (
    "region_daily_mean",
    "previous_daily_mean",
    "log_visitors_announced",
    "log_budget",
    "duration",
    "nonlocal_share",
    "weekend_ratio",
)
LOG_FEATURES = frozenset({"region_daily_mean", "previous_daily_mean", "duration"})


# 원시 행사 속성을 쓰지 않고 발행 당시의 유형 피처와 개최 시도로 계층을 정한다.
def group_values(frame: pl.DataFrame, events: dict[str, dict[str, Any]]) -> dict[str, list[str]]:
    return {
        "type": ["미상" if row["type"] is None else str(int(row["type"])) for row in frame.to_dicts()],
        "sido": [events[event_id].get("sido") or "미상" for event_id in frame["event_id"]],
    }


# 기존 피처 생성기와 동일하게 외부 관측 공개일을 검사하고 조건부 행사 입력은 구분한다.
def check_features(frame: pl.DataFrame, names: list[str]) -> None:
    for row in frame.to_dicts():
        check_availability(
            {
                name: Feature(row[name], row[f"{name}_available_at"], row[f"{name}_is_observation"])
                for name in names
            },
            row["as_of"],
        )


# 큰 규모 값은 로그 변환하고 결측은 학습에서 정한 값으로만 대체한다.
def raw_matrix(frame: pl.DataFrame, names: list[str]) -> np.ndarray:
    columns = []
    for name in names:
        values = np.asarray(frame[name].to_numpy(), dtype=float)
        if np.isinf(values).any() or (name in LOG_FEATURES and np.any(values < 0)):
            raise ValueError(f"도전 모델 피처 범위 오류: {name}")
        columns.append(np.log1p(values) if name in LOG_FEATURES else values)
    return np.column_stack(columns) if columns else np.empty((frame.height, 0))


# 결측 대체·표준화·계층 사전은 보정·평가 행사를 보지 않고 학습에서만 계산한다.
def fit_encoding(
    training: pl.DataFrame,
    names: list[str],
    events: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    chosen = [name for name in COVARIATES if name in names]
    raw = raw_matrix(training, chosen)
    fill = np.array([np.nanmedian(col) if np.isfinite(col).any() else 0.0 for col in raw.T])
    filled = np.where(np.isnan(raw), fill, raw)
    means, scales = filled.mean(axis=0), filled.std(axis=0)
    # 상수 열의 반올림 오차를 극소 표준편차로 나누지 않고 식별 불가능한 기울기를 제외한다.
    active = np.ptp(filled, axis=0) > 1e-12 * np.maximum(1, np.abs(means))
    groups = group_values(training, events)
    return {
        "features": [name for name, keep in zip(chosen, active, strict=True) if keep],
        "excluded_constant_features": [name for name, keep in zip(chosen, active, strict=True) if not keep],
        "fill": fill[active].tolist(),
        "mean": means[active].tolist(),
        "scale": scales[active].tolist(),
        "groups": {name: sorted(set(values)) for name, values in groups.items()},
    }


# 추론에서도 저장된 열 순서와 학습 통계만 사용한다.
def matrix(frame: pl.DataFrame, encoding: dict[str, Any]) -> np.ndarray:
    raw = raw_matrix(frame, encoding["features"])
    result = (np.where(np.isnan(raw), encoding["fill"], raw) - encoding["mean"]) / encoding["scale"]
    if not np.isfinite(result).all():
        raise ValueError("도전 모델 피처에 비유한 값이 있습니다")
    return result
