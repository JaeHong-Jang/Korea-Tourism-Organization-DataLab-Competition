"""공개된 발표치의 연속 규모 계층·학습 잔차 폭·구버전 호환성을 검증한다."""

import json
from datetime import date
from pathlib import Path

import numpy as np
import polars as pl
import pytest
from crowdcast.models.baselines import SimpleModel, weighted_quantile
from crowdcast.models.calibrate import rolling_split


# 발표/실측 비율이 일정한 작은 행사와 큰 행사를 같은 유형으로 준비한다.
def training() -> pl.DataFrame:
    return pl.DataFrame(
        {
            "type": [5.0] * 4,
            "daily_mean": [400.0, 600.0, 9000.0, 11000.0],
            "visitors_announced": [2400.0, 3600.0, 54000.0, 66000.0],
            "duration": [3.0] * 4,
            "as_of": [date(2023, 4, 19)] * 4,
            "visitors_announced_available_at": [date(2023, 3, 1)] * 4,
            "label_tier": ["goldA"] * 4,
        }
    )


# 전회차가 없을 때 발표치를 구간 중앙값으로 뭉개지 않고 연속적인 규모로 보정한다.
def test_scale_hierarchy_and_roundtrip(tmp_path: Path) -> None:
    model = SimpleModel(announced_scale=True).fit(training())
    row = training().row(0, named=True) | {"visitors_announced": 4200.0}
    assert model.announced_ratio == 2
    assert model.center(row) == 700
    assert model.center(row | {"visitors_announced": 24000.0}) == 4000
    assert model.center(row | {"previous_daily_mean": 1250.0}) == 1250
    assert model.scale_source(row | {"previous_daily_mean": 1250.0}) == "previous"
    assert model.scale_source(row) == "announced"
    assert model.center(row | {"visitors_announced": None}) == 4800
    assert model.center(row | {"visitors_announced": 0.0}) == 4800
    assert model.center(row | {"duration": None}) == 4800
    assert model.scale_source(row | {"visitors_announced": None}) == "type"
    path = tmp_path / "simple.json"
    path.write_text(json.dumps(vars(model)), encoding="utf-8")
    np.testing.assert_array_equal(
        model.predict(pl.DataFrame([row])), SimpleModel.load(path).predict(pl.DataFrame([row]))
    )


# 기준일 당일은 허용하고 다음 날·미상 공개일·미상 기준일은 예측과 적합에서 제외한다.
@pytest.mark.parametrize(
    "available,as_of,allowed",
    [
        (date(2023, 4, 19), date(2023, 4, 19), True),
        (date(2023, 4, 20), date(2023, 4, 19), False),
        (None, date(2023, 4, 19), False),
        (date(2023, 4, 19), None, False),
    ],
)
def test_publication_gate(available: date | None, as_of: date | None, allowed: bool) -> None:
    frame = training().with_columns(
        pl.lit(available).alias("visitors_announced_available_at"), pl.lit(as_of).alias("as_of")
    )
    row = frame.row(0, named=True)
    fitted = SimpleModel(announced_scale=True).fit(frame)
    model = SimpleModel(announced_scale=True).fit(training())
    assert model.scale_source(row) == ("announced" if allowed else "type")
    assert fitted.announced_ratio == (2 if allowed else None)
    assert len(fitted.announced_residuals) == (4 if allowed else 0)


# 구간 폭은 실제 학습 발표치 오차를 반영하고 예측 시 평가 정답을 참조하지 않는다.
def test_weighted_announcement_interval() -> None:
    frame = training().with_columns(
        pl.Series("daily_mean", [100.0, 600.0, 18000.0, 33000.0]),
        pl.Series("label_tier", ["goldA", "silver", "silver", "goldA"]),
    )
    model = SimpleModel(announced_scale=True).fit(frame, {"gold": 1.0, "silver": 0.5})
    # 가중 비율 중앙값은 1.5이며, 유형 중앙값의 잔차와 다른 발표치 전용 로그 잔차다.
    assert model.announced_ratio == pytest.approx(1.5)
    residuals = [
        [np.log1p(actual) - np.log1p(daily / 1.5), weight]
        for actual, daily, weight in [(100, 800, 1), (600, 1200, 0.5), (18000, 18000, 0.5), (33000, 22000, 1)]
    ]
    np.testing.assert_allclose(model.announced_residuals, residuals)
    low, high = weighted_quantile(residuals, [0.1, 0.9])
    row = frame.row(0, named=True) | {"visitors_announced": 6000.0}
    expected = np.expm1(
        [
            max(0, np.log1p(2000 / 1.5) + min(0, low)),
            np.log1p(2000 / 1.5),
            np.log1p(2000 / 1.5) + max(0, high),
        ]
    )
    actual = model.predict(pl.DataFrame([row]))[0]
    np.testing.assert_allclose(actual, expected)
    assert 0 <= actual[0] < actual[1] < actual[2]
    before = json.dumps(vars(model), sort_keys=True)
    np.testing.assert_array_equal(model.predict(pl.DataFrame([row | {"daily_mean": 1e15}])), [actual])
    assert json.dumps(vars(model), sort_keys=True) == before


# 보정·평가 연도 정답과 늦게 공개된 학습 발표치가 비율·폭을 바꾸지 못한다.
def test_scale_fold_isolation(model_data: tuple) -> None:
    frame, _ = model_data
    frame = frame.with_columns(
        pl.lit(3.0).alias("duration"),
        (pl.col("daily_mean") * 6).alias("visitors_announced"),
        pl.col("as_of").alias("visitors_announced_available_at"),
    )
    training_frame, _, evaluation = rolling_split(frame, 2025)
    late = training_frame.head(1).with_columns(
        pl.lit(date(2026, 1, 1)).alias("visitors_announced_available_at"),
        pl.lit(1e15).alias("visitors_announced"),
    )
    model = SimpleModel(announced_scale=True).fit(pl.concat([training_frame, late]))
    assert model.announced_ratio == 2
    assert sum(model.announced_pairs.values()) == training_frame.height
    changed = frame.with_columns(
        pl.when(pl.col("year") >= 2024).then(1e12).otherwise(pl.col("daily_mean")).alias("daily_mean")
    )
    other = SimpleModel(announced_scale=True).fit(rolling_split(changed, 2025)[0])
    np.testing.assert_array_equal(
        SimpleModel(announced_scale=True).fit(training_frame).predict(evaluation), other.predict(evaluation)
    )
    assert model.announced_residuals == other.announced_residuals


# 새 상태 키가 없는 v1·T-203b 발행본은 공개일 없는 발표치를 받아도 원래 예측 바이트다.
@pytest.mark.parametrize("with_ratio", [False, True])
def test_legacy_prediction_bytes(with_ratio: bool, tmp_path: Path) -> None:
    frame = training().drop("as_of", "visitors_announced_available_at")
    original = SimpleModel().fit(frame if with_ratio else frame.drop("visitors_announced"))
    state = {
        key: value
        for key, value in vars(original).items()
        if key not in {"announced_scale", "announced_residuals"}
        and (with_ratio or not key.startswith("announced_"))
    }
    path = tmp_path / "simple-v1.json"
    path.write_text(json.dumps(state), encoding="utf-8")
    assert SimpleModel.load(path).predict(frame).tobytes() == original.predict(frame).tobytes()
