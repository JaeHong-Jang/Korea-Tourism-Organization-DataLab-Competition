"""현재 자료로 두 LightGBM 후보를 재학습하고 같은 과거 행사에서 기존 단순 모델과 비교한다."""

import json
from datetime import UTC, datetime
from statistics import median
from typing import Any

import polars as pl
from crowdcast import paths
from crowdcast.features.build import filename_sensitivity
from crowdcast.models.__main__ import read_config, read_inputs
from crowdcast.models.backtest import metrics, run_backtest
from crowdcast.models.evaluate import select_features
from crowdcast.models.g0 import freeze_g0, verify_qc
from crowdcast.models.publish import run_lock, write_atomic


# 정답 정의를 나눠 지역 증감을 행사장 방문객 정확도로 보고하지 않는다.
def scores(points: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result = []
    for model in sorted({row["model"] for row in points}):
        for tier in sorted({row["tier"] for row in points}):
            rows = [row for row in points if row["model"] == model and row["tier"] == tier]
            if rows:
                result.append(
                    {
                        "model": model,
                        "tier": tier,
                        **metrics(rows),
                        "intervalWidthMedian": median(row["p90"] - row["p10"] for row in rows),
                    }
                )
    return result


# 평가 결과를 보기 전에 후보 설정을 기록하고 서비스 발행 포인터는 변경하지 않는다.
def execute() -> dict[str, Any]:
    with run_lock(paths.MODELS):
        frames, qc, hashes = read_inputs(paths.PROCESSED)
        verify_qc(qc, frames["labels"], frames["events"].to_dicts())
        config = read_config(paths.REPO_ROOT / "configs/model.yaml")
        run_id = "insight-" + datetime.now(UTC).strftime("%Y%m%dT%H%M%S%f")
        directory = paths.MODELS / run_id
        directory.mkdir()
        candidate = {**config, "lightgbm": {**config["lightgbm"], "num_leaves": 7, "reg_lambda": 5.0}}
        plan = {"baseline": config, "regularized": candidate}
        (directory / "plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
        selected = select_features(frames, config, audit_path=directory / "availability.json")
        feature_sets = {
            "conditional": selected["features"],
            "filename_sensitivity": filename_sensitivity(
                selected["features"], selected["names"], selected["index"], config["event_filename_dates"]
            ),
        }
        evaluations, baseline_ids = [], {}
        for name, setting in plan.items():
            for definition, features in feature_sets.items():
                target = directory / name / definition
                target.mkdir(parents=True)
                g0 = freeze_g0(target, qc, hashes, setting["eval_years"], run_id)
                result = run_backtest(
                    selected["labels"].join(features, on="event_id", how="inner"),
                    selected["names"],
                    selected["index"],
                    setting,
                    g0,
                    hashes,
                    target,
                )
                points = result["points"]
                if not points:
                    raise ValueError("평가 가능한 과거 자료가 없습니다")
                identity = sorted(
                    (p["eventId"], p["year"], p["tier"], p["actual"])
                    for p in points
                    if p["model"] == "simple"
                )
                if name == "baseline":
                    baseline_ids[definition] = identity
                elif identity != baseline_ids[definition]:
                    raise ValueError("후보와 기준 모델의 평가 표본이 다릅니다")
                pl.DataFrame(points, infer_schema_length=None).write_parquet(target / "points.parquet")
                evaluations.append(
                    {
                        "candidate": name,
                        "definition": definition,
                        "scores": scores(points),
                        "folds": result["folds"],
                    }
                )
                print(
                    json.dumps(
                        {"candidate": name, "definition": definition, "scores": scores(points)},
                        ensure_ascii=False,
                    ),
                    flush=True,
                )
        summary = {
            "runId": run_id,
            "computedAt": datetime.now(UTC).isoformat(),
            "inputHashes": hashes,
            "evaluations": evaluations,
            "goldCount": result["g0"]["gold_summary"]["gold_event_count"],
            "status": "검증 후보",
            "promoted": False,
            "limitations": [
                "지역 방문 증감 대용 정답의 성적은 행사장 방문객 정확도가 아님",
                "관측 공개일 가정과 행사 속성 공개 시점 미입증",
                "기존에 검토한 평가 연도를 재사용한 탐색적 비교",
                "동시 인원은 별도 실측 검증 없이 환산한 추정",
            ],
        }
        # 완료된 실험만 발행하며 진행 중인 결과와 불완전한 모델은 화면에 공개하지 않는다.
        write_atomic(
            directory / "summary.json", json.dumps(summary, ensure_ascii=False, indent=2).encode("utf-8")
        )
        print(json.dumps({"completed": run_id, "directory": str(directory)}, ensure_ascii=False), flush=True)
        return summary


if __name__ == "__main__":
    execute()
