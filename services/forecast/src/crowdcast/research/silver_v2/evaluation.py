"""v1과 같은 월별 분할에서 변형 하나를 학습·보정·예측한다."""

import json
from pathlib import Path

import polars as pl

from crowdcast.research.silver_expansion.estimators import save_model
from crowdcast.research.silver_expansion.evaluation import prediction_frame
from crowdcast.research.silver_v2.estimators import fit_variant, interval_scale_correction, predict_variant


# 학습 표본 기준(군집 100개)과 보정 자료는 v1과 같고 구간 폭만 행마다 규모에 비례한다.
def evaluate_variant(
    frame: pl.DataFrame,
    names: list[str],
    splits: list[dict],
    kind: str,
    params: dict,
    *,
    relative: bool,
    save_directory: Path | None = None,
) -> tuple[pl.DataFrame, list[dict]]:
    predictions, logs = [], []
    for split in splits:
        train = frame.filter(pl.col("event_id").is_in(split["train"]))
        calibration = frame.filter(pl.col("event_id").is_in(split["calibration"]))
        evaluation = frame.filter(pl.col("event_id").is_in(split["evaluation"]))
        if not evaluation.height:
            continue
        log = {
            "month": split["month"],
            "model": kind,
            "train_n": train.height,
            "calibration_n": calibration.height,
            "evaluation_n": evaluation.height,
            "sample_gate": split["train_clusters"] >= 100,
        }
        logs.append(log)
        if not log["sample_gate"] or not calibration.height:
            log["status"] = "insufficient_training_or_calibration"
            continue

        # 모델·대체값·규모 대체값은 학습 자료에서만 정하고 보정 자료로는 구간 폭만 정한다.
        models, encoding = fit_variant(train, names, params, relative=relative)
        cal_pred, cal_scale = predict_variant(models, encoding, calibration)
        pred, scale = predict_variant(models, encoding, evaluation)
        correction = interval_scale_correction(calibration, cal_pred, cal_scale)
        if save_directory is not None:
            directory = save_directory / split["month"]
            save_model(models, encoding, evaluation, directory)
            (directory / "encoding.json").write_text(json.dumps(encoding, indent=2), encoding="utf-8")
        log.update({"status": "evaluated", "relative_correction": correction})
        row = prediction_frame(evaluation, pred, 0.0, split["month"], kind).with_columns(
            pl.Series("lower", pred[:, 0] - correction * scale),
            pl.Series("upper", pred[:, 2] + correction * scale),
            pl.Series("interval_correction", correction * scale),
        )
        predictions.append(row)
    if not predictions:
        return pl.DataFrame(), logs
    result = pl.concat(predictions)
    assert result["event_id"].n_unique() == result.height
    assert result.select(
        pl.all_horizontal(pl.col("lower") <= pl.col("p50"), pl.col("p50") <= pl.col("upper")).all()
    ).item()
    assert all(result[n].is_finite().all() for n in ("p10", "p50", "p90", "lower", "upper"))
    return result, logs
