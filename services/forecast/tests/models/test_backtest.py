"""연도 분할·MAPIE 보정 복원·백테스트 결정성과 사전 G0 불변성을 검증한다."""

import json
from pathlib import Path

import lightgbm as lgb
import numpy as np
import polars as pl
import pytest
from crowdcast.models.backtest import metrics, run_backtest, summary
from crowdcast.models.calibrate import calibrate, predict_calibrated, rolling_split
from crowdcast.models.card import model_card, validate_contract
from crowdcast.models.g0 import freeze_g0
from crowdcast.models.train import fit_quantiles, save_quantiles

# 테스트마다 같은 수치 열 순서를 사용한다.
NAMES = ["type", "region_daily_mean", "previous_daily_mean"]


# 평가 연도 행이 학습·보정에 없고 늦게 공개된 보정 라벨도 빠져야 한다.
def test_rolling_split(model_data: tuple) -> None:
    frame, _ = model_data
    training, calibration, evaluation = rolling_split(frame, 2025)
    assert set(training["year"]) == {2022, 2023}
    assert set(calibration["year"]) == {2024}
    assert set(evaluation["year"]) == {2025}
    assert not set(training["event_id"]) & set(evaluation["event_id"])
    with_golden = frame.with_columns((pl.col("year") == 2023).alias("is_golden"))
    assert set(rolling_split(with_golden, 2025)[0]["year"]) == {2022}
    changed = frame.with_columns(
        pl.when(pl.col("year") == 2024)
        .then(pl.date(2025, 5, 1))
        .otherwise(pl.col("available_at"))
        .alias("available_at")
    )
    assert rolling_split(changed, 2025)[1].height == 0


# 저장한 세 모델과 보정 상수로 MAPIE 경로의 예측을 정확히 복원한다.
def test_cqr_roundtrip(model_data: tuple, config: dict, tmp_path: Path) -> None:
    frame, _ = model_data
    training, calibration, evaluation = rolling_split(frame, 2025)
    models, encoding = fit_quantiles(training, NAMES, config)
    correction = calibrate(models, encoding, calibration)
    before = predict_calibrated(models, encoding, correction, evaluation)
    save_quantiles(tmp_path, models, encoding)
    restored = [lgb.Booster(model_file=str(tmp_path / f"p{alpha}.txt")) for alpha in (10, 50, 90)]
    np.testing.assert_array_equal(before, predict_calibrated(restored, encoding, correction, evaluation))
    assert np.all(np.diff(before, axis=1) >= 0)
    assert correction["years"] == [2024]


# 백테스트 진입 전에 G0가 있어야 하며 두 번 실행해도 결정 파일·지표·예측은 같다.
def test_backtest_determinism_and_g0(
    model_data: tuple,
    config: dict,
    label_qc: dict,
    input_hashes: dict,
    tmp_path: Path,
) -> None:
    frame, events = model_data
    with pytest.raises(FileNotFoundError):
        run_backtest(frame, NAMES, events, config, tmp_path / "g0.json", input_hashes, tmp_path)
    path = freeze_g0(tmp_path, label_qc, input_hashes, config["eval_years"], "v1-test")
    before, timestamp = path.read_bytes(), path.stat().st_mtime_ns
    first = run_backtest(frame, NAMES, events, config, path, input_hashes, tmp_path)
    first_summary = summary(first, "bt-test", "v1-test")
    second = run_backtest(frame, NAMES, events, config, path, input_hashes, tmp_path)
    assert first_summary == summary(second, "bt-test", "v1-test")
    assert first["points"] == second["points"]
    assert path.read_bytes() == before and path.stat().st_mtime_ns == timestamp
    assert first["g0"]["primary_model"] == "simple"
    assert {p["eventId"] for p in first["points"] if p["model"] == "simple"} == {
        p["eventId"] for p in first["points"] if p["model"] == "lightgbm"
    }
    validate_contract("backtest-summary", first_summary)
    card = model_card(first, "v1-test", "bt-test", NAMES, config, "a" * 64, {})
    validate_contract("model-card", card)


# 평가 정답을 바꿔도 사전 결정·학습 모델·예측 값은 바뀌지 않고 성적만 달라진다.
def test_evaluation_cannot_select_model(
    model_data: tuple,
    config: dict,
    label_qc: dict,
    input_hashes: dict,
    tmp_path: Path,
) -> None:
    frame, events = model_data
    config["eval_years"] = [2025]
    path = freeze_g0(tmp_path, label_qc, input_hashes, [2025], "v1-test")
    before = path.read_bytes()
    original = run_backtest(frame, NAMES, events, config, path, input_hashes, tmp_path)
    model_bytes = (tmp_path / "p50.txt").read_bytes()
    changed = frame.with_columns(
        pl.when(pl.col("year") == 2025)
        .then(pl.col("daily_mean") * 10)
        .otherwise(pl.col("daily_mean"))
        .alias("daily_mean")
    )
    altered = run_backtest(changed, NAMES, events, config, path, input_hashes, tmp_path)
    assert path.read_bytes() == before
    assert (tmp_path / "p50.txt").read_bytes() == model_bytes
    assert [p["p50"] for p in original["points"]] == [p["p50"] for p in altered["points"]]
    assert metrics(original["points"])["mdape"] != metrics(altered["points"])["mdape"]


# 표본 부족 연도는 두 모델에 공통으로 명시적인 사유를 남긴다.
def test_insufficient_training_skips_year(
    model_data: tuple,
    config: dict,
    label_qc: dict,
    input_hashes: dict,
    tmp_path: Path,
) -> None:
    frame, events = model_data
    frame = frame.filter(pl.col("year") != 2022)
    path = freeze_g0(tmp_path, label_qc, input_hashes, config["eval_years"], "v1-test")
    result = run_backtest(frame, NAMES, events, config, path, input_hashes, tmp_path)
    assert "학습 0" in result["folds"][0]["skipped"]
    assert summary(result, "bt-test", "v1-test")["evalYears"] == [2025]
    assert json.loads((tmp_path / "training.json").read_text())["train_years"] == [2023]


# 골든은 평가 전용 표에만 두고 일평균 정의가 맞는 재현 결과를 계약으로 검사한다.
def test_golden_replay(
    model_data: tuple, config: dict, label_qc: dict, input_hashes: dict, tmp_path: Path
) -> None:
    frame, events = model_data
    config["eval_years"] = [2025]
    golden = frame.filter(pl.col("year") == 2025).head(1).with_columns(pl.lit(True).alias("is_golden"))
    ordinary = frame.filter(~pl.col("event_id").is_in(golden["event_id"].to_list()))
    path = freeze_g0(tmp_path, label_qc, input_hashes, [2025], "v1-golden")
    result = run_backtest(ordinary, NAMES, events, config, path, input_hashes, tmp_path, golden)
    assert len(result["golden"]) == 1
    assert result["golden"][0]["eventId"] not in result["folds"][0]["train_ids"]
    validate_contract("backtest-summary", summary(result, "bt-golden", "v1-golden"))
