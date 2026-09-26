"""연도 분할을 고정하고 MAPIE CQR의 보정값을 학습·평가에서 분리한다."""

from typing import Any

import lightgbm as lgb
import numpy as np
import polars as pl
from crowdcast.models.train import matrix
from mapie.regression import ConformalizedQuantileRegressor


# 보정 정답도 첫 평가 행사의 D-14까지 공개되어야 당시 실행 가능한 모델이다.
def rolling_split(frame: pl.DataFrame, year: int) -> tuple[pl.DataFrame, pl.DataFrame, pl.DataFrame]:
    frame = frame.filter(~pl.col("is_golden"))
    evaluation = frame.filter(pl.col("year") == year).sort("event_id")
    cutoff = evaluation["as_of"].min() if evaluation.height else None
    known = frame.filter(pl.col("available_at") <= cutoff) if cutoff else frame.head(0)
    training = known.filter(pl.col("year") <= year - 2).sort("event_id")
    calibration = known.filter(pl.col("year") == year - 1).sort("event_id")
    return training, calibration, evaluation


# MAPIE 입력에서도 교차를 제거해 보정 잔차가 역전된 원본 분위수에 의존하지 않게 한다.
class OrderedQuantile:
    # MAPIE의 prefit 검사에 필요한 최소 예측기 표면과 학습 완료 표지만 제공한다.
    def __init__(self, models: list[lgb.LGBMRegressor], index: int) -> None:
        self.models = models
        self.index = index
        self.fitted_ = True

    # 이미 학습된 모델을 실수로 보정 자료에 다시 학습시키는 호출을 막는다.
    def fit(self, *args: Any, **kwargs: Any) -> None:
        raise RuntimeError("CQR은 prefit 모델만 사용합니다")

    # LightGBM의 원시 예측을 로그 공간에서 정렬한다.
    def predict(self, x: np.ndarray, **kwargs: Any) -> np.ndarray:
        return np.sort(np.column_stack([model.booster_.predict(x) for model in self.models]), axis=1)[
            :, self.index
        ]


# MAPIE의 실제 보정 결과에서 상수를 추출해 라이브러리 내부 속성 없이 저장한다.
def calibrate(
    models: list[lgb.LGBMRegressor],
    encoding: dict[str, Any],
    frame: pl.DataFrame,
) -> dict[str, Any]:
    x = matrix(frame, encoding)
    estimator = ConformalizedQuantileRegressor(
        estimator=[OrderedQuantile(models, index) for index in (0, 2, 1)],
        confidence_level=0.8,
        prefit=True,
    )
    estimator.conformalize(x, np.log1p(frame["daily_mean"].to_numpy()))
    center, intervals = estimator.predict_interval(x[:1], symmetric_correction=True)
    raw = np.sort(np.array([model.booster_.predict(x[:1])[0] for model in models]))
    correction = float(raw[0] - intervals[0, 0, 0])
    if not np.isclose(intervals[0, 1, 0] - raw[2], correction) or not np.isclose(center[0], raw[1]):
        raise ValueError("MAPIE CQR 대칭 보정 결과 불일치")
    return {
        "method": "MAPIE CQR",
        "confidence_level": 0.8,
        "symmetric": True,
        "correction_log": correction,
        "n": frame.height,
        "event_ids": frame["event_id"].to_list(),
        "years": sorted(frame["year"].unique().to_list()),
    }


# 저장된 보정 상수만 적용하고 마지막에 교차·음수를 제거한다.
def predict_calibrated(
    models: list[lgb.LGBMRegressor | lgb.Booster],
    encoding: dict[str, Any],
    correction: dict[str, Any],
    frame: pl.DataFrame,
) -> np.ndarray:
    x = matrix(frame, encoding)
    raw = np.sort(
        np.column_stack(
            [(model if isinstance(model, lgb.Booster) else model.booster_).predict(x) for model in models]
        ),
        axis=1,
    )
    raw[:, 0] -= correction["correction_log"]
    raw[:, 2] += correction["correction_log"]
    return np.expm1(np.maximum(0, np.sort(raw, axis=1)))
