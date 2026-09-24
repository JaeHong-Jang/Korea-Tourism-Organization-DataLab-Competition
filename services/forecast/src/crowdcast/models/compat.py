"""LightGBM 분위수 학습·직렬화와 금지 설정을 실행 전에 검사한다."""

from pathlib import Path
from typing import Any

import lightgbm as lgb
import numpy as np


# quantile에서 프로세스를 중단시키는 단조 제약을 라이브러리 호출 전에 거부한다.
def quantile_regressor(alpha: float, **params: Any) -> lgb.LGBMRegressor:
    forbidden = {"monotone_constraints", "monotonic_cst", "monotone_constraint", "mc"}
    if forbidden.intersection(params):
        raise ValueError("quantile 목적함수에는 monotone_constraints를 사용할 수 없습니다")
    if not lgb.__version__.startswith("4.6."):
        raise RuntimeError("검증한 LightGBM 4.6 버전만 허용합니다")
    if alpha not in (0.1, 0.5, 0.9):
        raise ValueError("분위수는 0.1·0.5·0.9만 허용합니다")
    params = {"num_leaves": 15, "min_child_samples": 10, **params}
    leaves = ("num_leaves", "num_leaf", "max_leaves", "max_leaf", "max_leaf_nodes")
    minimum = ("min_child_samples", "min_data_in_leaf", "min_data_per_leaf", "min_data", "min_samples_leaf")
    if any(params[key] > 15 for key in leaves if key in params) or any(
        params[key] < 10 for key in minimum if key in params
    ):
        raise ValueError("num_leaves ≤ 15, min_data_in_leaf ≥ 10이어야 합니다")
    return lgb.LGBMRegressor(
        objective="quantile",
        alpha=alpha,
        verbosity=-1,
        n_jobs=1,
        deterministic=True,
        force_col_wise=True,
        **params,
    )


# 합성 자료에서 세 모델의 저장·복원 예측이 같아야 실제 학습을 시작한다.
def check_compatibility(directory: Path) -> None:
    rng = np.random.default_rng(2026)
    x = rng.normal(size=(80, 3))
    y = np.log1p(np.abs(1000 + x[:, 0] * 300 + rng.normal(size=80) * 50))
    for alpha in (0.1, 0.5, 0.9):
        model = quantile_regressor(alpha, num_leaves=7, min_child_samples=10, n_estimators=5)
        model.fit(x, y)
        path = directory / f"compat-{alpha}.txt"
        model.booster_.save_model(str(path))
        restored = lgb.Booster(model_file=str(path))
        np.testing.assert_array_equal(model.booster_.predict(x), restored.predict(x))
