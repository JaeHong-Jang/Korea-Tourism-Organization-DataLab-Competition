"""고정된 G0를 읽고 동일 연도 분할에서 두 모델과 세 기준선을 채점한다."""

import json
from pathlib import Path
from typing import Any

import numpy as np
import polars as pl
from crowdcast.models.baselines import SimpleModel, host_expected
from crowdcast.models.calibrate import calibrate, predict_calibrated, rolling_split
from crowdcast.models.distribution import distribution
from crowdcast.models.explain import explain
from crowdcast.models.g0 import read_g0
from crowdcast.models.ood import detect_ood, fit_ood
from crowdcast.models.train import fit_quantiles, save_quantiles


# 지표의 오차는 백분율, 포함률·재현율·정밀도는 비율로 계산한다.
def metrics(points: list[dict[str, Any]], baseline: str = "b2") -> dict[str, Any]:
    if not points:
        raise ValueError("평가 표본이 없어 계약의 수치 지표를 만들 수 없습니다")
    actual = np.array([p["actual"] for p in points])
    median = np.array([p["p50"] for p in points])
    errors = np.abs(median - actual) / actual * 100
    included = sum(p["p10"] <= p["actual"] <= p["p90"] for p in points)
    true_positive = sum(p["actual_level"] >= 3 and p["level"] >= 3 for p in points)
    positives = sum(p["actual_level"] >= 3 for p in points)
    predicted = sum(p["level"] >= 3 for p in points)
    pairs = [p for p in points if p.get(baseline) is not None]
    delta = None
    if pairs:
        base = np.median([abs(p[baseline] - p["actual"]) / p["actual"] * 100 for p in pairs])
        model = np.median([abs(p["p50"] - p["actual"]) / p["actual"] * 100 for p in pairs])
        delta = float(base - model)
    return {
        "mdape": float(np.median(errors)),
        "coverage80": included / len(points),
        "coverageN": len(points),
        "judgmentRecall": true_positive / positives if positives else None,
        "judgmentPrecision": true_positive / predicted if predicted else None,
        "baselineDeltaPp": delta,
        "comparablePairs": len(pairs),
    }


# 입력의 행사 정의를 기존 환산·판정 함수가 받는 필드로만 옮긴다.
def contract_event(event: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": event["event_id"],
        "type": event.get("type") or "기타",
        "startsAt": f"{event['start'].isoformat()}T00:00:00+09:00",
        "endsAt": f"{event['end'].isoformat()}T23:59:59+09:00",
        "timeOfDay": event.get("time_of_day") or "미상",
        "hazards": event.get("hazard_flags") or [],
    }


# 예측·실측 모두 같은 순간 최대 환산과 판정으로 등급을 비교한다.
def score_points(
    name: str,
    quantiles: np.ndarray,
    evaluation: pl.DataFrame,
    events: dict[str, dict[str, Any]],
    simple: SimpleModel,
    ood: dict[str, Any],
    config: dict[str, Any],
    basis: str,
) -> list[dict[str, Any]]:
    points = []
    for row, prediction in zip(evaluation.to_dicts(), quantiles, strict=True):
        event = events[row["event_id"]]
        inputs = contract_event(event)
        peak, judgment = distribution(
            prediction, inputs, seed=config["seed"], n=config["samples"], basis=basis
        )
        _, observed = distribution(
            [row["daily_mean"]] * 3, inputs, seed=config["seed"], n=config["samples"], basis=basis
        )
        peak_quantity = peak.quantity("q-backtest-peak")
        points.append(
            {
                "model": name,
                "eventId": row["event_id"],
                "name": event["name"],
                "year": row["year"],
                "tier": row["label_tier"],
                "actual": row["daily_mean"],
                **dict(zip(("p10", "p50", "p90"), map(float, prediction), strict=True)),
                **{f"peak_{key}": peak_quantity[key] for key in ("p10", "p50", "p90")},
                "level": judgment.judgment["level"],
                "actual_level": observed.judgment["level"],
                "basis": basis,
                "event_attributes_available_at": row.get("event_attributes_available_at"),
                "event_attributes_masked": row.get("event_attributes_masked", False),
                "schedule_attributes_masked": row.get("schedule_attributes_masked", False),
                "b0": simple.b0(row),
                "b1": row["previous_daily_mean"],
                "b2": host_expected(event, row),
                "spatial_scope": row["spatial_scope"],
                **detect_ood(row, float(prediction[1]), ood),
            }
        )
    return points


# 학습·보정 표본이 부족한 해는 두 모델을 함께 건너뛰어 비교 모집단을 유지한다.
def run_backtest(
    frame: pl.DataFrame,
    names: list[str],
    events: dict[str, dict[str, Any]],
    config: dict[str, Any],
    g0_path: Path,
    input_hashes: dict[str, str],
    directory: Path,
    golden_frame: pl.DataFrame | None = None,
) -> dict[str, Any]:
    frozen = read_g0(g0_path, input_hashes)
    if config["eval_years"] != frozen["eval_years"]:
        raise ValueError("평가 연도가 사전 G0와 다릅니다")
    result: dict[str, Any] = {"g0": frozen, "points": [], "folds": [], "golden": [], "golden_skipped": []}
    for year in sorted(config["eval_years"]):
        training, calibration, evaluation = rolling_split(frame, year)
        fold = {
            "year": year,
            "train_n": training.height,
            "calibration_n": calibration.height,
            "evaluation_n": evaluation.height,
            "late_train_n": frame.filter(pl.col("year") <= year - 2).height - training.height,
            "late_calibration_n": frame.filter(pl.col("year") == year - 1).height - calibration.height,
            "skipped": None,
        }
        reasons = []
        if training.height < config["min_train_rows"]:
            reasons.append(f"학습 {training.height} < 최소 {config['min_train_rows']} (학습 ≤ {year - 2})")
        if calibration.height < config["min_calibration_rows"]:
            reasons.append(
                f"보정 {calibration.height} < 최소 {config['min_calibration_rows']} (보정 {year - 1})"
            )
        if not evaluation.height:
            reasons.append("평가 가능 라벨 없음")
        if reasons:
            fold["skipped"] = "; ".join(reasons)
            result["folds"].append(fold)
            continue

        # 두 모델 모두 같은 학습 구간을 쓰며 단순 모델의 구간은 학습 잔차로만 만든다.
        simple = SimpleModel().fit(training)
        models, encoding = fit_quantiles(training, names, config)
        correction = calibrate(models, encoding, calibration)
        ood = fit_ood(training, names)
        predictions = {
            "simple": simple.predict(evaluation),
            "lightgbm": predict_calibrated(models, encoding, correction, evaluation),
        }
        for name, values in predictions.items():
            result["points"].extend(
                score_points(name, values, evaluation, events, simple, ood, config, frozen["basis"])
            )

        # 평가 자료를 추가 학습하지 않고 마지막 성공 분할을 API용 모델로 저장한다.
        fold.update(
            train_ids=training["event_id"].to_list(),
            calibration_ids=calibration["event_id"].to_list(),
            evaluation_ids=evaluation["event_id"].to_list(),
            train_years=sorted(training["year"].unique().to_list()),
            calibration_years=sorted(calibration["year"].unique().to_list()),
            cutoff=evaluation["as_of"].min().isoformat(),
            train_range={
                "from": min(events[e]["start"] for e in training["event_id"]).isoformat(),
                "to": max(events[e]["end"] for e in training["event_id"]).isoformat(),
            },
        )
        for destination in (directory / str(year), directory):
            save_quantiles(destination, models, encoding)
            for filename, content in {
                "calibration": correction,
                "simple": vars(simple),
                "ood": ood,
                "training": fold,
            }.items():
                (destination / f"{filename}.json").write_text(
                    json.dumps(content, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8"
                )
        factors = dict(zip(evaluation["event_id"], explain(models[1], evaluation, encoding), strict=True))
        (directory / str(year) / "factors.json").write_text(
            json.dumps(factors, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8"
        )
        result["folds"].append(fold)
        result["last_train_range"] = fold["train_range"]
        if golden_frame is not None:
            result["golden"].extend(
                replay_golden(
                    golden_frame.filter(pl.col("year") == year),
                    events,
                    models,
                    encoding,
                    correction,
                    simple,
                    frozen["primary_model"],
                    training,
                    calibration,
                    result["golden_skipped"],
                )
            )
    return result


# 골든 실측은 학습에 들어가지 않으며 당시 공개된 학습·보정 자료로 재현할 수 있을 때만 비교한다.
def replay_golden(
    frame: pl.DataFrame,
    events: dict[str, dict[str, Any]],
    models: list[Any],
    encoding: dict[str, Any],
    correction: dict[str, Any],
    simple: SimpleModel,
    primary: str,
    training: pl.DataFrame,
    calibration: pl.DataFrame,
    skipped: list[str],
) -> list[dict[str, Any]]:
    results = []
    latest = max(training["available_at"].max(), calibration["available_at"].max())
    for row in frame.to_dicts():
        if row["as_of"] < latest or row["time_unit"] != "일" or row["spatial_scope"] != "행사장":
            skipped.append(f"{row['event_id']}: 당시 모델 재현 불가 또는 일평균·행사장 정의 불일치")
            continue
        single = frame.filter(pl.col("event_id") == row["event_id"])
        predicted = (
            simple.predict(single)
            if primary == "simple"
            else predict_calibrated(models, encoding, correction, single)
        )
        low, median, high = map(float, predicted[0])
        event = events[row["event_id"]]
        results.append(
            {
                "eventId": row["event_id"],
                "name": event["name"],
                "hostExpected": event.get("expectedByHost"),
                "model": {"p10": low, "p50": median, "p90": high, "unit": "명/일", "timeUnit": "일"},
                "actual": {
                    "id": "q-" + row["event_id"] + "-actual",
                    "name": "골든 실측 일평균",
                    "value": row["daily_mean"],
                    "p10": None,
                    "p50": None,
                    "p90": None,
                    "unit": "명/일",
                    "timeUnit": "일",
                    "spatialScope": "행사장",
                    "valueKind": "사후집계",
                    "estimated": False,
                    "assumptionIds": [],
                    "announcedAt": row["available_at"].isoformat(),
                },
                "unitsComparable": True,
                "verdict": "포함" if low <= row["daily_mean"] <= high else "벗어남",
            }
        )
    return results


# 공개 계약에는 주 모델만 담고 비교 모델·세부 표는 동일 실행의 Parquet·Markdown에 남긴다.
def summary(result: dict[str, Any], run_id: str, version: str) -> dict[str, Any]:
    points = [p for p in result["points"] if p["model"] == result["g0"]["primary_model"]]
    fields = ("eventId", "name", "year", "tier", "actual", "p10", "p50", "p90")
    return {
        "runId": run_id,
        "modelRunId": f"mr-{version}",
        "modelVersion": version,
        "target": "일평균 방문객",
        "evalYears": sorted({p["year"] for p in points}),
        "metrics": metrics(points),
        "points": [{key: p[key] for key in fields} for p in points],
        "golden": result["golden"],
    }
