"""공개 시점 검사를 통과한 전회차 관측을 우선하는 LightGBM 결합 후보를 검증한다."""

import json
import sys
from pathlib import Path
from typing import Any

import lightgbm as lgb
import numpy as np
import polars as pl
from crowdcast import paths
from crowdcast.features.build import filename_sensitivity
from crowdcast.models.__main__ import read_inputs
from crowdcast.models.backtest import score_points
from crowdcast.models.baselines import SimpleModel
from crowdcast.models.calibrate import predict_calibrated, rolling_split
from crowdcast.models.evaluate import select_features
from crowdcast.models.insight_experiment import scores
from crowdcast.models.publish import write_atomic


# 전회차 관측이 없는 행사만 LightGBM을 쓰며 평가 정답은 입력으로 받지 않는다.
def predict_history(frame: pl.DataFrame, estimates: np.ndarray, simple: SimpleModel) -> np.ndarray:
    if estimates.shape != (frame.height, 3) or not np.isfinite(estimates).all():
        raise ValueError("예측 배열의 표본 수·분위수 오류")
    result = estimates.copy()
    prior = frame["previous_daily_mean"].to_list()
    mask = np.array([value is not None and np.isfinite(value) and value >= 0 for value in prior])
    if mask.any():
        result[mask] = simple.predict(frame.filter(pl.Series(mask)))
    return result


# 완료된 실험의 학습 모델을 그대로 복원해 추가 결합 규칙만 같은 평가 행에 적용한다.
def execute(run_id: str) -> dict[str, Any]:
    if Path(run_id).name != run_id or not run_id.startswith("insight-"):
        raise ValueError("실험 식별자 오류")
    root = paths.MODELS / run_id
    summary = json.loads((root / "summary.json").read_text(encoding="utf-8"))
    plan = json.loads((root / "plan.json").read_text(encoding="utf-8"))
    config = plan["regularized"]
    config["event_filename_dates"] = {
        int(key): value for key, value in config["event_filename_dates"].items()
    }
    frames, _, hashes = read_inputs(paths.PROCESSED)
    if hashes != summary["inputHashes"]:
        raise ValueError("학습 이후 입력 자료가 변경되었습니다")
    selected = select_features(frames, config, audit_path=root / "history-availability.json")
    definitions = {
        "conditional": selected["features"],
        "filename_sensitivity": filename_sensitivity(
            selected["features"], selected["names"], selected["index"], config["event_filename_dates"]
        ),
    }
    evaluations = []
    for definition, features in definitions.items():
        points = []
        folder = root / "regularized" / definition
        original = next(
            row
            for row in summary["evaluations"]
            if row["candidate"] == "regularized" and row["definition"] == definition
        )
        for fold in original["folds"]:
            if fold["skipped"] is not None:
                continue
            path = folder / str(fold["year"])

            # 각 평가 연도에 저장된 설정만 읽어 다른 분할의 모델을 섞지 않는다.
            def read(name: str, folder: Path = path) -> dict[str, Any]:
                return json.loads((folder / f"{name}.json").read_text(encoding="utf-8"))

            frame = selected["labels"].join(features, on="event_id", how="inner")
            _, _, evaluation = rolling_split(frame, fold["year"])
            simple = SimpleModel.load(path / "simple.json")
            models = [
                lgb.Booster(model_str=(path / f"p{q}.txt").read_text(encoding="utf-8")) for q in (10, 50, 90)
            ]
            estimates = predict_calibrated(models, read("features"), read("calibration"), evaluation)
            predicted = predict_history(evaluation, estimates, simple)
            points.extend(
                score_points(
                    "history", predicted, evaluation, selected["index"], simple, read("ood"), config, "구간"
                )
            )
        pl.DataFrame(points, infer_schema_length=None).write_parquet(folder / "history-points.parquet")
        evaluations.append(
            {
                "candidate": "history",
                "definition": definition,
                "scores": scores(points),
                "folds": original["folds"],
            }
        )
    # 앞선 실험도 같은 정의의 구간 폭을 재계산해 넓힌 범위만으로 개선을 주장하지 않는다.
    for row in summary["evaluations"]:
        row["scores"] = scores(
            pl.read_parquet(root / row["candidate"] / row["definition"] / "points.parquet").to_dicts()
        )
    summary["evaluations"] = [
        row for row in summary["evaluations"] if row["candidate"] != "history"
    ] + evaluations
    summary["status"] = "추가 관측 검증 필요"
    summary["limitations"].append("전회차 결합 규칙은 첫 실험 결과를 본 뒤 추가해 독립 검증이 필요함")
    raw = json.dumps(summary, ensure_ascii=False, indent=2).encode("utf-8")
    write_atomic(root / "history-summary.json", raw)
    write_atomic(paths.PROCESSED / "insight_model_experiment.json", raw)
    print(json.dumps({"runId": run_id, "evaluations": evaluations}, ensure_ascii=False), flush=True)
    return summary


if __name__ == "__main__":
    execute(sys.argv[1])
