"""백테스트와 파이프라인 features 단계가 같은 표본 선택·피처로 두 정의의 롤링 평가를 실행한다."""

import json
from collections import Counter
from pathlib import Path
from typing import Any

import polars as pl
from crowdcast.features.build import build_features, filename_sensitivity
from crowdcast.models.backtest import run_backtest, summary
from crowdcast.models.card import model_card
from crowdcast.models.train import select_labels


# 학습 표본과 골든 평가 행사를 고른 뒤 공개 시점 검사를 거친 피처를 만든다.
def select_features(frames: dict[str, pl.DataFrame], config: dict[str, Any]) -> dict[str, Any]:
    events = frames["events"].to_dicts()
    labels, excluded = select_labels(frames["labels"], events, config)
    golden_ids = set(frames["labels"].filter(pl.col("is_golden"))["event_id"]) | {
        event["event_id"] for event in events if event.get("is_golden")
    }
    index = {event["event_id"]: event for event in events}
    golden_ids &= {
        event["event_id"]
        for event in events
        if event.get("start") and event.get("end") and event["end"] >= event["start"]
    }
    golden_labels = frames["labels"].filter(
        pl.col("event_id").is_in(golden_ids)
        & pl.col("is_primary")
        & (pl.col("daily_mean") > 0)
        & pl.col("available_at").is_not_null()
    )

    # 피처는 실제 공개일 검사 뒤에만 라벨과 결합하며 골든은 별도 평가 표로 분리한다.
    features, names = build_features(
        events,
        frames["labels"].to_dicts(),
        frames["region_daily"],
        set(labels["event_id"]) | set(golden_labels["event_id"]),
    )
    return {
        "events": events,
        "index": index,
        "labels": labels,
        "excluded": excluded,
        "golden_labels": golden_labels,
        "features": features,
        "names": names,
    }


# 학습·평가 모델 파일은 임시 폴더에만 쓰고 계약 문서는 메모리에서 함께 만든다.
def run_models(
    frames: dict[str, pl.DataFrame],
    config: dict[str, Any],
    g0_path: Path,
    hashes: dict[str, str],
    models_stage: Path,
    report_directory: Path,
    version: str,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], Any]:
    selected = select_features(frames, config)
    labels, excluded, index = selected["labels"], selected["excluded"], selected["index"]
    features, names, golden_labels = selected["features"], selected["names"], selected["golden_labels"]
    frame = labels.join(features, on="event_id", how="inner")
    golden_frame = golden_labels.join(features, on="event_id", how="inner")
    features.write_parquet(models_stage / "feature_availability.parquet")
    result = run_backtest(frame, names, index, config, g0_path, hashes, models_stage, golden_frame)

    # 같은 표본·설정·분할에서 속성만 가린 참고 모델을 별도 위치에 저장한다.
    sensitivity_directory = models_stage / "filename_sensitivity"
    sensitivity_directory.mkdir(exist_ok=True)
    sensitivity = filename_sensitivity(features, names, index, config["event_filename_dates"])
    sensitivity.write_parquet(sensitivity_directory / "feature_availability.parquet")
    result["sensitivity"] = run_backtest(
        labels.join(sensitivity, on="event_id", how="inner"),
        names,
        index,
        config,
        g0_path,
        hashes,
        sensitivity_directory,
    )
    if result["folds"] != result["sensitivity"]["folds"]:
        raise RuntimeError("조건부·민감도 백테스트 분할 불일치")
    # 보정비율과 등급별 학습 쌍 수는 저장한 모델에서 읽어 보고서에도 그대로 공개한다.
    result["announcement_calibration"] = []
    for definition, directory in (("조건부", models_stage), ("파일명 민감도", sensitivity_directory)):
        for fold in result["folds"]:
            if fold["skipped"] is not None:
                continue
            state = json.loads((directory / str(fold["year"]) / "simple.json").read_text(encoding="utf-8"))
            result["announcement_calibration"].append(
                {
                    "definition": definition,
                    "year": fold["year"],
                    "ratio": state["announced_ratio"],
                    "pairs": state["announced_pairs"],
                }
            )

    # 선택 후 표본 분모는 행사 유형·연도별로 따로 기록한다.
    selected_counts = Counter(
        (row["year"], index[row["event_id"]].get("type") or "미상") for row in labels.to_dicts()
    )
    result["selected_counts"] = [
        {"year": year, "type": kind, "n": count} for (year, kind), count in sorted(selected_counts.items())
    ]

    # 평가 가능 연도가 없으면 실행 폴더와 분리된 실패 기록에 사유만 남기고 계약 수치는 만들지 않는다.
    if not result["points"]:
        failure = report_directory.parent / "failures" / f"{report_directory.name}.md"
        failure.parent.mkdir(parents=True, exist_ok=True)
        failure.write_text(
            "평가 가능 연도 없음. 계약 수치 지표를 생성하지 않았습니다.\n"
            + json.dumps(result["folds"], ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        raise ValueError(f"모든 평가 연도를 건너뛰었습니다 — {failure.name}의 표본 수·사유 확인 필요")
    result["excluded"] = excluded
    backtest = summary(result, report_directory.name, version)
    missing = {name: features[name].null_count() for name in names}
    card = model_card(result, version, report_directory.name, names, config, hashes["labels"], missing)
    return result, card, backtest, excluded
