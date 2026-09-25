"""발표치 규모 보정의 학습 구간 한정·우선순위·저장 복원·OOD를 검증한다."""

import json
import math
from datetime import date
from pathlib import Path

import numpy as np
import polars as pl
import pytest
from crowdcast.models.baselines import SimpleModel
from crowdcast.models.calibrate import rolling_split
from crowdcast.models.ood import detect_ood, fit_ood


# 같은 유형에서 입력 규모만 다른 두 계층을 만들어 유형 중앙값과 구분한다.
def announced_training() -> pl.DataFrame:
    return pl.DataFrame(
        {
            "type": [5.0] * 4,
            "daily_mean": [400.0, 600.0, 9000.0, 11000.0],
            "visitors_announced": [2400.0, 3600.0, 54000.0, 66000.0],
            "duration": [3.0] * 4,
            "label_tier": ["goldA"] * 4,
        }
    )


# 발표치는 학습한 비율로 계층만 고르고 예측 중앙값은 그 계층의 학습 라벨에서 나온다.
def test_calibrated_scale_and_priority(tmp_path: Path) -> None:
    model = SimpleModel().fit(announced_training())
    assert model.announced_ratio == 2
    assert model.announced_pairs == {"goldA": 4}
    small = {"type": 5.0, "visitors_announced": 3600.0, "duration": 3.0}
    assert model.group(small) == "5:<1000"
    assert model.center(small) == 500
    assert model.center({**small, "visitors_announced": 66000.0}) == 10000
    assert model.group({**small, "previous_daily_mean": 6000.0}) == "5:>5000"
    assert model.center({**small, "previous_daily_mean": 6000.0}) == 6000
    assert model.b0(small) == 4800

    # 누락과 0은 구분하고 비어 있는 규모대에 맞추기 위해 작은 예측을 지어내지 않는다.
    assert model.center({"type": 5.0}) == 4800
    assert model.group({**small, "duration": None}) == "5:1000~5000"
    assert model.group({**small, "visitors_announced": 0.0}) == "5:<1000"
    path = tmp_path / "simple.json"
    path.write_text(json.dumps(vars(model)), encoding="utf-8")
    restored = SimpleModel.load(path)
    assert restored.announced_ratio == 2 and restored.announced_pairs == {"goldA": 4}
    np.testing.assert_array_equal(
        model.predict(pl.DataFrame([small])), restored.predict(pl.DataFrame([small]))
    )


# 학습·보정·평가와 늦게 공개된 학습연도 정답을 섞어도 fit에는 허용 학습행만 전달된다.
def test_announcement_ratio_uses_only_training_fold(model_data: tuple) -> None:
    frame, _ = model_data
    frame = frame.with_columns(
        pl.lit(3.0).alias("duration"),
        (pl.col("daily_mean") * pl.when(pl.col("year") <= 2023).then(6.0).otherwise(3000.0)).alias(
            "visitors_announced"
        ),
    )
    train, calibration, evaluation = rolling_split(frame, 2025)
    model = SimpleModel().fit(train)
    assert model.announced_ratio == 2
    state = json.dumps(vars(model), sort_keys=True)
    before = model.predict(evaluation)
    corrupted = evaluation.with_columns(pl.lit(1e12).alias("daily_mean"))
    np.testing.assert_array_equal(before, model.predict(corrupted))
    model.predict(calibration.with_columns(pl.lit(1e12).alias("daily_mean")))
    assert json.dumps(vars(model), sort_keys=True) == state

    # 보정·평가 정답을 바꾼 전체 표에서 분할을 다시 해도 비율은 같다.
    changed = frame.with_columns(
        pl.when(pl.col("year") >= 2024).then(1e12).otherwise(pl.col("daily_mean")).alias("daily_mean")
    )
    assert SimpleModel().fit(rolling_split(changed, 2025)[0]).announced_ratio == 2

    # 학습 연도라도 공개가 늦은 극단적 쌍은 모델 적합에 들어가지 않는다.
    late_id = train["event_id"][0]
    late = frame.with_columns(
        pl.when(pl.col("event_id") == late_id)
        .then(date(2025, 12, 31))
        .otherwise(pl.col("available_at"))
        .alias("available_at"),
        pl.when(pl.col("event_id") == late_id)
        .then(1e12)
        .otherwise(pl.col("visitors_announced"))
        .alias("visitors_announced"),
    )
    fitted = SimpleModel().fit(rolling_split(late, 2025)[0])
    assert fitted.announced_ratio == 2
    assert sum(fitted.announced_pairs.values()) == train.height - 1


# 유효 쌍이 없으면 보정률을 1로 지어내지 않고 기존 v1 모델도 같은 동작으로 복원한다.
@pytest.mark.parametrize("announced", [None, 0.0])
def test_no_pairs_and_legacy_model(announced: float | None, tmp_path: Path) -> None:
    frame = announced_training().with_columns(pl.lit(announced).alias("visitors_announced"))
    model = SimpleModel().fit(frame)
    assert model.announced_ratio is None and model.announced_pairs == {}
    assert model.center({"type": 5.0, "visitors_announced": 900.0, "duration": 3.0}) == 4800
    state = {key: value for key, value in vars(model).items() if not key.startswith("announced_")}
    path = tmp_path / "simple-v1.json"
    path.write_text(json.dumps(state), encoding="utf-8")
    assert SimpleModel.load(path).center({"type": 5.0, "visitors_announced": 900.0, "duration": 3.0}) == 4800


# 원본 발표치와 로그 모두 학습 범위를 기록하고 범위 밖 값은 OOD에 포함한다.
def test_announced_ood_ranges() -> None:
    frame = announced_training().with_columns(
        pl.col("visitors_announced").log1p().alias("log_visitors_announced")
    )
    names = ["visitors_announced", "log_visitors_announced"]
    ood = fit_ood(frame, names)
    result = detect_ood(
        {"type": 5.0, "visitors_announced": 1e6, "log_visitors_announced": math.log1p(1e6)}, 10000, ood
    )
    assert result["outside_features"] == names
