"""도전 모델의 짧은 PyMC 적합·계층 불확실성·사후 예측 분위수와 누수 검사를 검증한다."""

from copy import deepcopy
from datetime import date
from pathlib import Path

import numpy as np
import polars as pl
import pytest
from crowdcast.models.challenger.config import ChallengerConfig
from crowdcast.models.challenger.encoding import check_features, fit_encoding, matrix
from crowdcast.models.challenger.fit import fit
from crowdcast.models.challenger.posterior import Posterior
from scipy.stats import t


# 동일 시드 적합·저장 복원·배치 순서 변경이 예측과 파일 바이트를 바꾸지 않는다.
def test_seed_restore_and_new_groups(
    posterior: Posterior, small_training: tuple, config: dict, tmp_path: Path
) -> None:
    frame, events = small_training
    repeated = fit(
        frame,
        ["region_daily_mean", "previous_daily_mean"],
        events,
        config,
        ChallengerConfig(draws=64, iterations=80),
    )
    posterior.save(tmp_path / "first")
    repeated.save(tmp_path / "second")
    assert (tmp_path / "first/posterior.json").read_bytes() == (
        tmp_path / "second/posterior.json"
    ).read_bytes()
    restored = Posterior.load(tmp_path / "first")
    actual = posterior.predict(frame.head(3), events)
    np.testing.assert_array_equal(actual, restored.predict(frame.head(3), events))
    np.testing.assert_array_equal(actual[::-1], restored.predict(frame.head(3).reverse(), events))
    assert np.all(np.diff(actual, axis=1) > 0) and np.all(actual > 0)
    effect = restored.group_effect("sido", "제주특별자치도")
    assert np.std(effect) > 0
    np.testing.assert_array_equal(effect, restored.group_effect("sido", "제주특별자치도"))


# 잔차가 있는 사후 예측 구간은 절편만 같은 표본이어도 Student-t의 분석 분위수와 일치한다.
def test_predictive_interval_includes_residual(posterior: Posterior, small_training: tuple) -> None:
    frame, events = small_training
    state = deepcopy(posterior)
    state.samples = {name: np.zeros_like(value) for name, value in state.samples.items()}
    state.samples["intercept"][:] = np.log(1000)
    state.samples["sigma"][:] = 0.2
    state.samples["nu"][:] = 5
    expected = np.exp(np.log(1000) + 0.2 * t.ppf([0.1, 0.5, 0.9], 5))
    np.testing.assert_allclose(state.predict(frame.head(1), events)[0], expected, rtol=1e-10)


# 평가 극단값이 결측 대체·표준화 기준을 바꾸지 않으며 공개일 위반은 즉시 실패한다.
def test_training_only_encoding_and_availability(small_training: tuple) -> None:
    frame, events = small_training
    encoding = fit_encoding(frame, ["region_daily_mean"], events)
    before = deepcopy(encoding)
    huge = frame.head(1).with_columns(pl.lit(1e12).alias("region_daily_mean"))
    assert matrix(huge, encoding)[0, 0] > 100
    assert encoding == before
    observed = frame.with_columns(
        pl.lit(date(2022, 4, 20)).alias("region_daily_mean_available_at"),
        pl.lit(True).alias("region_daily_mean_is_observation"),
    )
    with pytest.raises(ValueError, match="공개 시점 위반"):
        check_features(observed, ["region_daily_mean"])


# 상수 로그 값의 극소 표준편차와 전부 결측인 공변량은 새 행사 값을 폭발시키지 않는다.
def test_constant_covariates_are_excluded(small_training: tuple, config: dict) -> None:
    frame, events = small_training
    frame = frame.with_columns(
        pl.lit(33741.25).alias("previous_daily_mean"),
        pl.lit(None, dtype=pl.Float64).alias("region_daily_mean"),
    )
    posterior = fit(
        frame,
        ["previous_daily_mean", "region_daily_mean"],
        events,
        config,
        ChallengerConfig(iterations=20, draws=16),
    )
    assert posterior.encoding["features"] == []
    assert set(posterior.encoding["excluded_constant_features"]) == {
        "previous_daily_mean",
        "region_daily_mean",
    }
    assert np.isfinite(posterior.predict(frame.head(1), events)).all()


# 선택 가능한 NUTS도 짧은 단일 체인으로 실제 실행해 설정이 무시되지 않음을 확인한다.
def test_short_nuts(small_training: tuple, config: dict) -> None:
    frame, events = small_training
    posterior = fit(
        frame,
        ["region_daily_mean"],
        events,
        config,
        ChallengerConfig(method="nuts", draws=8, tune=8, chains=1),
    )
    assert len(posterior.samples["intercept"]) == 8
    assert posterior.metadata["config"]["method"] == "nuts"
    assert "divergences" in posterior.metadata["diagnostics"]


# 비정상 추론 횟수·음수 시드와 알 수 없는 방식은 모델 실행 전에 차단한다.
@pytest.mark.parametrize("settings", [{"draws": 0}, {"iterations": 0}, {"seed": -1}, {"method": "unknown"}])
def test_invalid_config(settings: dict) -> None:
    with pytest.raises(ValueError):
        ChallengerConfig(**settings)
