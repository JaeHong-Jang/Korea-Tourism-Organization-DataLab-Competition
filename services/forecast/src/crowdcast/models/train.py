"""허용 라벨만 골라 학습 구간의 인코딩과 세 LightGBM 분위수 모델을 저장한다."""

import json
from pathlib import Path
from typing import Any

import lightgbm as lgb
import numpy as np
import polars as pl
from crowdcast.models.compat import quantile_regressor


# 골든·코로나·명절 실버와 라벨 품질 제외를 집계해 실행 보고서에 남긴다.
def select_labels(
    labels: pl.DataFrame,
    events: list[dict[str, Any]],
    config: dict[str, Any],
) -> tuple[pl.DataFrame, list[dict[str, Any]]]:
    index = {event["event_id"]: event for event in events}
    golden_ids = set(labels.filter(pl.col("is_golden"))["event_id"]) | {
        event["event_id"] for event in events if event.get("is_golden")
    }
    selected, excluded = [], []
    for row in labels.to_dicts():
        event = index.get(row["event_id"])
        reasons = []
        if not row["is_primary"]:
            reasons.append("비대표")
        if row["event_id"] in golden_ids:
            reasons.append("골든")
        if config["exclude_covid"] and row["year"] in (2020, 2021):
            reasons.append("코로나")
        if row["label_tier"] == "silver" and (
            "holiday_overlap" in row.get("quality_flag", "")
            or event
            and (event.get("holiday_overlap") or any(k in event["name"] for k in ("설날", "추석")))
        ):
            reasons.append("명절 실버 채점 불가")
        if not row["usable_for_training"]:
            reasons.append("라벨 QC 제외")
        if row["label_tier"] == "goldB" and row.get("spatial_scope") != "행사장":
            reasons.append("영역 미확인 골드B")
        if not event or not event.get("start") or not event.get("end") or event["end"] < event["start"]:
            reasons.append("일정·행사 연결 미확정")
        if not np.isfinite(row["daily_mean"]) or row["daily_mean"] <= 0 or row["available_at"] is None:
            reasons.append("정답·공개일 불명")
        if reasons:
            excluded.append(
                {
                    "event_id": row["event_id"],
                    "year": row["year"],
                    "tier": row["label_tier"],
                    "type": event.get("type") if event else None,
                    "reasons": reasons,
                }
            )
        else:
            selected.append(row)
    return pl.DataFrame(selected, schema=labels.schema), excluded


# 결측 대체는 학습 구간에서만 정하며 전부 결측인 열은 영 상수로 남긴다.
def fit_encoding(frame: pl.DataFrame, names: list[str]) -> dict[str, Any]:
    return {
        "features": names,
        "fill_values": {
            name: float(frame[name].median()) if frame[name].drop_nulls().len() else 0.0 for name in names
        },
    }


# 저장된 피처 순서·대체값을 평가와 예보에 동일하게 적용한다.
def matrix(frame: pl.DataFrame, encoding: dict[str, Any]) -> np.ndarray:
    return frame.select(
        [pl.col(name).fill_null(encoding["fill_values"][name]) for name in encoding["features"]]
    ).to_numpy()


# 하이퍼파라미터는 설정에 고정하고 가중치는 라벨 등급에만 의존한다.
def fit_quantiles(
    frame: pl.DataFrame,
    names: list[str],
    config: dict[str, Any],
) -> tuple[list[lgb.LGBMRegressor], dict[str, Any]]:
    encoding = fit_encoding(frame, names)
    x, y = matrix(frame, encoding), np.log1p(frame["daily_mean"].to_numpy())
    weights = np.where(
        frame["label_tier"].to_numpy() == "silver", config["silver_weight"], config["gold_weight"]
    )
    models = []
    for alpha in (0.1, 0.5, 0.9):
        model = quantile_regressor(alpha, random_state=config["seed"], **config["lightgbm"])
        model.fit(x, y, sample_weight=weights, feature_name=names)
        models.append(model)
    return models, encoding


# 모델 본체와 피처 순서를 함께 남겨 복원할 때 열이 어긋나는 것을 막는다.
def save_quantiles(directory: Path, models: list[lgb.LGBMRegressor], encoding: dict[str, Any]) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    for alpha, model in zip((10, 50, 90), models, strict=True):
        model.booster_.save_model(str(directory / f"p{alpha}.txt"))
    (directory / "features.json").write_text(
        json.dumps(encoding, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
