"""분포·확률 일관성과 SHAP·OOD의 학습 자료 의존성을 검증한다."""

import numpy as np
import polars as pl
from crowdcast.models.backtest import contract_event
from crowdcast.models.card import validate_contract
from crowdcast.models.distribution import distribution
from crowdcast.models.explain import explain
from crowdcast.models.ood import detect_ood, fit_ood
from crowdcast.models.train import fit_quantiles


# 순간 최대 중앙값이 기준을 넘으면 같은 표본의 도달 확률도 절반 이상이다.
def test_peak_probability_consistency(model_data: tuple) -> None:
    _, events = model_data
    event = contract_event(next(iter(events.values())))
    for quantiles in ([5000.0, 4000.0, 3000.0], [0.0, 1000.0, 10000.0], [0.0, 0.0, 0.0]):
        peak, result = distribution(quantiles, event, seed=2026)
        quantity = peak.quantity("q-test-peak")
        assert quantity["p10"] <= quantity["p50"] <= quantity["p90"]
        for probability in result.probabilities:
            if quantity["p50"] > probability["threshold"]:
                assert probability["probability"] >= 0.5
        np.testing.assert_array_equal(peak.samples, distribution(quantiles, event, seed=2026)[0].samples)


# 설명은 상위 다섯 로그 기여도로 제한하고 발행 전 근거는 빈 배열이다.
def test_shap_factors(model_data: tuple, config: dict) -> None:
    frame, _ = model_data
    frame = frame.with_columns(pl.lit(1.0).alias("duration"), pl.lit(5.0).alias("month"))
    names = ["type", "region_daily_mean", "previous_daily_mean", "duration", "month"]
    models, encoding = fit_quantiles(frame.head(48), names, config)
    factors = explain(models[1], frame.tail(1), encoding)[0]
    assert len(factors) == 5
    assert [abs(f["contribution"]) for f in factors] == sorted(
        [abs(f["contribution"]) for f in factors], reverse=True
    )
    for factor in factors:
        assert factor["evidenceIds"] == [] and not any(c.isdigit() for c in factor["label"])
        validate_contract("factor", {**factor, "evidenceIds": ["ev-model-test"]})


# 계층 표본 다섯 건 경계와 피처 최솟값·최댓값 밖을 각각 검출한다.
def test_ood_boundaries() -> None:
    frame = pl.DataFrame(
        {
            "type": [5.0] * 5,
            "daily_mean": [500.0] * 5,
            "region_daily_mean": [100.0, 200.0, 300.0, 400.0, 500.0],
        }
    )
    row = {"type": 5.0, "region_daily_mean": 500.0}
    assert not detect_ood(row, 500.0, fit_ood(frame, ["type", "region_daily_mean"]))["ood"]
    assert detect_ood(row, 500.0, fit_ood(frame.head(4), ["type", "region_daily_mean"]))["ood"]
    row["region_daily_mean"] = 501.0
    assert detect_ood(row, 500.0, fit_ood(frame, ["type", "region_daily_mean"]))["outside_features"] == [
        "region_daily_mean"
    ]
