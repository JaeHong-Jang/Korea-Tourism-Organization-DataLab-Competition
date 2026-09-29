"""동일한 월별 평가·보정 자료로 기준선과 모델 대조군의 예측을 남긴다."""

import json
from pathlib import Path

import numpy as np
import polars as pl

from crowdcast.research.silver_expansion.estimators import (
    baseline_predictions, fit_model, interval_correction, predict_model, save_model,
)


# 연구 모델별 예측에는 원래 정답과 진단 열 및 보정 구간을 함께 저장한다.
def prediction_frame(frame: pl.DataFrame, predicted: np.ndarray, correction: float, month: str, kind: str) -> pl.DataFrame:
    metadata = ["event_id", "window_id", "sigungu_code", "event_type", "year", "target", "snr", "holiday", "overlap"]
    return frame.select(metadata).with_columns(
        pl.lit(kind).alias("model"), pl.lit(month).alias("month"),
        pl.Series("p10", predicted[:, 0]), pl.Series("p50", predicted[:, 1]), pl.Series("p90", predicted[:, 2]),
        pl.Series("lower", predicted[:, 0] - correction), pl.Series("upper", predicted[:, 2] + correction),
        pl.lit(correction).alias("interval_correction"),
    )


# 학습행만 바꾸는 SNR 대조군과 동일 보정·평가셋을 사용해 표본 선택 효과를 분리한다.
def evaluate(frame: pl.DataFrame, names: list[str], splits: list[dict], kind: str, params: dict,
             *, save_directory: Path | None = None) -> tuple[pl.DataFrame, list[dict]]:
    predictions, logs = [], []
    for split in splits:
        train = frame.filter(pl.col("event_id").is_in(split["train"]))
        calibration = frame.filter(pl.col("event_id").is_in(split["calibration"]))
        evaluation = frame.filter(pl.col("event_id").is_in(split["evaluation"]))
        if not evaluation.height:
            continue
        if kind == "snr_filtered":
            train = train.filter(pl.col("snr") > 3)
        gate = train.height >= 20 if kind == "snr_filtered" else split["train_clusters"] >= 100
        log = {"month": split["month"], "model": kind, "train_n": train.height,
               "calibration_n": calibration.height, "evaluation_n": evaluation.height,
               "train_clusters": train["cluster_id"].n_unique(),
               "boundary_excluded_n": len(split["excluded_boundary"]), "sample_gate": gate}
        logs.append(log)
        if not gate or not calibration.height:
            log["status"] = "insufficient_training_or_calibration"
            continue

        # 대체값과 모델은 학습에서만 결정하고 보정·평가로 다시 학습하지 않는다.
        if kind in ("zero", "type_median"):
            cal_pred = baseline_predictions(train, calibration, kind)
            pred = baseline_predictions(train, evaluation, kind)
        else:
            models, encoding = fit_model(train, names, params)
            cal_pred = predict_model(models, encoding, calibration)
            pred = predict_model(models, encoding, evaluation)
            if save_directory is not None:
                directory = save_directory / split["month"]
                save_model(models, encoding, evaluation, directory)
                (directory / "encoding.json").write_text(json.dumps(encoding, indent=2), encoding="utf-8")
        correction = interval_correction(calibration, cal_pred)
        log.update({"status": "evaluated", "interval_correction": correction})
        predictions.append(prediction_frame(evaluation, pred, correction, split["month"], kind))
    if not predictions:
        return pl.DataFrame(), logs
    result = pl.concat(predictions)
    assert result["event_id"].n_unique() == result.height
    assert result.select(pl.all_horizontal(pl.col("lower") <= pl.col("p50"), pl.col("p50") <= pl.col("upper")).all()).item()
    assert all(result[n].is_finite().all() for n in ("p10", "p50", "p90", "lower", "upper"))
    return result, logs
