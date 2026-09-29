"""전회차 결합의 선택·영값·불변성과 한글 경로 모델 저장을 검증한다."""

import lightgbm as lgb
import numpy as np
import polars as pl
import pytest
from crowdcast.models.baselines import SimpleModel
from crowdcast.models.history_candidate import predict_history
from crowdcast.models.train import fit_quantiles, matrix, save_quantiles


# 과거 관측이 있는 행사만 대체하고 관측 부재 행사는 학습 모델의 구간을 유지한다.
def test_history_uses_only_known_prior_and_keeps_input():
    training = pl.DataFrame({"type": [1, 1, 1], "daily_mean": [100.0, 150.0, 200.0]})
    model = SimpleModel().fit(training)
    frame = pl.DataFrame({"type": [1, 1, 1], "previous_daily_mean": [120.0, None, 0.0]})
    values = np.array([[100.0, 200.0, 300.0]] * 3)
    result = predict_history(frame, values, model)
    assert result[0, 1] == pytest.approx(120)
    assert result[2, 1] == pytest.approx(0)
    np.testing.assert_array_equal(result[1], values[1])
    np.testing.assert_array_equal(values, [[100, 200, 300]] * 3)
    assert np.all(np.diff(result, axis=1) >= 0)


# 잘못된 예측 배열을 모델 개선 결과로 저장하지 않는다.
def test_history_rejects_invalid_quantities():
    frame = pl.DataFrame({"previous_daily_mean": [None]})
    with pytest.raises(ValueError):
        predict_history(frame, np.array([[1, np.nan, 3]]), SimpleModel())


# Windows 한글 경로에 저장된 모델 문자열을 복원해 동일한 수치가 나오는지 확인한다.
def test_quantile_unicode_save_roundtrip(tmp_path):
    frame = pl.DataFrame(
        {"x": np.arange(30, dtype=float), "daily_mean": np.arange(30) + 10.0, "label_tier": ["silver"] * 30}
    )
    config = {"seed": 2026, "silver_weight": 0.5, "gold_weight": 1.0, "lightgbm": {"n_estimators": 3}}
    models, encoding = fit_quantiles(frame, ["x"], config)
    destination = tmp_path / "한글 모델"
    save_quantiles(destination, models, encoding)
    restored = lgb.Booster(model_str=(destination / "p50.txt").read_text(encoding="utf-8"))
    np.testing.assert_array_equal(
        restored.predict(matrix(frame, encoding)), models[1].booster_.predict(matrix(frame, encoding))
    )
