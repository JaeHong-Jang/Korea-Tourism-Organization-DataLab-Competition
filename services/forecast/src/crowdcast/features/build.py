"""행사별 D-14 피처와 공개일을 조립하고 학습 직전 누수 게이트를 실행한다."""

import json
from datetime import timedelta
from pathlib import Path
from typing import Any

import pandera.polars as pa
import polars as pl
from crowdcast import paths
from crowdcast.features.availability import Feature, availability_counts, check_availability
from crowdcast.features.calendar_features import calendar_features
from crowdcast.features.event_features import event_features
from crowdcast.features.history_features import history_features
from crowdcast.features.region_features import prepare_regions, region_features


# 선택된 피처 값과 공개일을 같은 행에 남겨 API와 감사에서 그대로 읽게 한다.
def build_features(
    events: list[dict[str, Any]],
    labels: list[dict[str, Any]],
    region_daily: pl.DataFrame,
    event_ids: set[str],
    *,
    audit_path: Path | None = None,
) -> tuple[pl.DataFrame, list[str]]:
    audit_path = audit_path or paths.PROCESSED / "features_availability.json"
    audit = {
        "checked": 0,
        "violations": 0,
        "asOfRule": "외부 관측 available_at ≤ as_of = 시작일 − 14일; 행사 입력 제외",
    }
    regions = prepare_regions(region_daily)
    golden_ids = {row["event_id"] for row in labels if row["is_golden"]}
    history = {
        row["event_id"]: row for row in labels if row["is_primary"] and row["event_id"] not in golden_ids
    }
    rows: list[dict[str, Any]] = []
    names: list[str] = []
    for event in sorted(events, key=lambda row: row["event_id"]):
        if event["event_id"] not in event_ids:
            continue
        if not event.get("start") or not event.get("end") or event["end"] < event["start"]:
            raise ValueError(f"피처 일정 미확정: {event['event_id']}")
        as_of = event["start"] - timedelta(days=14)
        features: dict[str, Feature] = {
            **event_features(event),
            **calendar_features(event, as_of),
            **history_features(event, as_of, events, history),
            **region_features(
                event.get("sigungu_code"),
                as_of,
                regions,
                continuity_break=bool(event.get("continuity_break")),
            ),
        }
        counts = availability_counts(features, as_of)
        for key in ("checked", "violations"):
            audit[key] += counts[key]
        if counts["violations"]:
            write_availability(audit_path, audit)
        check_availability(features, as_of)
        names = list(features)
        rows.append(
            {
                "event_id": event["event_id"],
                "as_of": as_of,
                **{name: feature.value for name, feature in features.items()},
                **{f"{name}_available_at": feature.available_at for name, feature in features.items()},
                **{f"{name}_is_observation": feature.is_observation for name, feature in features.items()},
            }
        )
    if not rows:
        raise ValueError("피처를 만들 수 있는 행사가 없습니다")

    # 결측은 허용하지만 수치 타입·유한성·행사 고유성은 표 전체에서 검증한다.
    schema = {
        "event_id": pl.String,
        "as_of": pl.Date,
        **dict.fromkeys(names, pl.Float64),
        **{f"{name}_available_at": pl.Date for name in names},
        **{f"{name}_is_observation": pl.Boolean for name in names},
    }
    frame = pl.DataFrame(rows, schema=schema)
    columns = {
        name: pa.Column(dtype, nullable=name not in ("event_id", "as_of")) for name, dtype in schema.items()
    }
    pa.DataFrameSchema(columns, unique=["event_id"], strict=True).validate(frame, lazy=True)
    if frame.select(
        pl.any_horizontal([pl.col(name).is_infinite() | pl.col(name).is_nan() for name in names]).any()
    ).item():
        raise ValueError("피처에 비유한 값이 있습니다")
    write_availability(audit_path, audit)
    return frame, names


# 성공·누수 실패 모두 이번 실행의 검사 건수로 파이프라인 연계 파일을 덮어쓴다.
def write_availability(path: Path, audit: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
