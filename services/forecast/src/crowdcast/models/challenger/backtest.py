"""사용 모델과 동일한 롤링 표본을 강제하고 도전 모델을 기존 환산·판정 함수로 채점한다."""

import json
from pathlib import Path
from typing import Any

import numpy as np
import polars as pl
from crowdcast.models.backtest import metrics, score_points
from crowdcast.models.baselines import SimpleModel
from crowdcast.models.calibrate import rolling_split
from crowdcast.models.challenger.config import ChallengerConfig
from crowdcast.models.challenger.fit import fit
from crowdcast.models.challenger.snapshot import Snapshot


# 폴드와 평가 정답 불일치는 모델 적합 전에 실패시켜 다른 모집단 비교를 막는다.
def matched_folds(snapshot: Snapshot) -> list[tuple[dict[str, Any], pl.DataFrame, pl.DataFrame]]:
    result = []
    config = snapshot.manifest["config"]
    if [f["year"] for f in snapshot.manifest["folds"]] != sorted(config["eval_years"]):
        raise ValueError("발행 폴드의 평가 연도 불일치")
    expected = {}
    for fold in snapshot.manifest["folds"]:
        training, calibration, evaluation = rolling_split(snapshot.frame, fold["year"])
        for name, frame in (("train", training), ("calibration", calibration), ("evaluation", evaluation)):
            if fold[f"{name}_n"] != frame.height:
                raise ValueError(f"발행 폴드 표본 수 불일치: {fold['year']} {name}")
            if fold["skipped"] is None and fold[f"{name}_ids"] != frame["event_id"].to_list():
                raise ValueError(f"발행 폴드 라벨 ID 불일치: {fold['year']} {name}")
        skipped = (
            training.height < config["min_train_rows"]
            or calibration.height < config["min_calibration_rows"]
            or not evaluation.height
        )
        if skipped != (fold["skipped"] is not None):
            raise ValueError("발행 폴드 건너뛰기 조건 불일치")
        if skipped:
            continue
        expected.update({(row["year"], row["event_id"]): row for row in evaluation.to_dicts()})
        result.append((fold, training, evaluation))
    if not result:
        raise ValueError("도전 모델과 비교할 평가 폴드가 없습니다")

    # 두 기존 모델의 행사·연도·라벨 값·등급이 모두 같아야 비교 지표를 만들 수 있다.
    for model in ("simple", "lightgbm"):
        points = [p for p in snapshot.points if p["model"] == model]
        actual = {(p["year"], p["eventId"]): p for p in points}
        if len(actual) != len(points) or set(actual) != set(expected):
            raise ValueError(f"발행 평가 행사 집합 불일치: {model}")
        for key, row in expected.items():
            if row["daily_mean"] != actual[key]["actual"] or row["label_tier"] != actual[key]["tier"]:
                raise ValueError(f"발행 평가 라벨 불일치: {model} {key}")
    return result


# 평가·보정 라벨을 적합에 더하지 않고 마지막 성공 분할의 사후분포만 추론용으로 복사한다.
def compare(snapshot: Snapshot, directory: Path, config: ChallengerConfig) -> dict[str, Any]:
    points, diagnostics = [], []
    baseline = {(p["year"], p["eventId"]): p for p in snapshot.points if p["model"] == "lightgbm"}
    for fold, training, evaluation in matched_folds(snapshot):
        posterior = fit(training, snapshot.names, snapshot.events, snapshot.manifest["config"], config)
        posterior.metadata.update(base_model_version=snapshot.directory.name, evaluation_year=fold["year"])
        posterior.save(directory / str(fold["year"]))
        posterior.save(directory)
        source = snapshot.directory / str(fold["year"])
        scored = score_points(
            "pymc",
            posterior.predict(evaluation, snapshot.events),
            evaluation,
            snapshot.events,
            SimpleModel.load(source / "simple.json"),
            json.loads((source / "ood.json").read_bytes()),
            snapshot.manifest["config"],
            snapshot.g0["basis"],
        )
        for point in scored:
            if point["actual_level"] != baseline[(point["year"], point["eventId"])]["actual_level"]:
                raise ValueError("사용 모델과 환산 판정 정답이 다릅니다")
        points.extend(scored)
        diagnostics.append({"year": fold["year"], **posterior.metadata["diagnostics"]})

    # 지표뿐 아니라 포함 건수·판정 양성 분모·구간 폭을 공개해 넓은 구간의 포함률을 과장하지 않는다.
    all_points = [*snapshot.points, *points]
    rows = []
    for year in [None, *sorted({p["year"] for p in points})]:
        for model in ("simple", "lightgbm", "pymc"):
            selected = [p for p in all_points if p["model"] == model and (year is None or p["year"] == year)]
            rows.append(
                {
                    "year": year,
                    "model": model,
                    **metrics(selected),
                    "covered": sum(p["p10"] <= p["actual"] <= p["p90"] for p in selected),
                    "actualPositive": sum(p["actual_level"] >= 3 for p in selected),
                    "medianWidth": float(np.median([p["p90"] - p["p10"] for p in selected])),
                }
            )
    return {
        "baseRunId": snapshot.manifest["run_id"],
        "baseModelVersion": snapshot.directory.name,
        "primaryModel": snapshot.g0["primary_model"],
        "modelVersion": snapshot.directory.name + "-challenger",
        "config": config.document(),
        "inputHashes": snapshot.manifest["input_hashes"],
        "folds": snapshot.manifest["folds"],
        "metrics": rows,
        "diagnostics": diagnostics,
        "features": posterior.encoding["features"],
        "pymcVersion": posterior.metadata["pymc_version"],
        "evaluationDefinition": "conditional",
        "promotionEligible": False,
        "points": points,
    }
