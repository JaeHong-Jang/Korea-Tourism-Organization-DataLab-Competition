"""행사별 D-14 피처와 공개일을 조립하고 학습 직전 누수 게이트를 실행한다."""

import json
from datetime import timedelta
from pathlib import Path
from typing import Any

import pandera.polars as pa
import polars as pl
from crowdcast import paths
from crowdcast.features.availability import (
    Feature,
    availability_counts,
    check_availability,
    publication_date,
)
from crowdcast.features.calendar_features import calendar_features
from crowdcast.features.event_features import event_features
from crowdcast.features.history_features import history_features
from crowdcast.features.region_features import prepare_regions, region_features

# 관측 피처의 계보 열(계약 observation의 datasetId·sigunguCode·observedAt·unit)과 형식.
LINEAGE_FIELDS = {
    "dataset_id": pl.String,
    "sigungu_code": pl.String,
    "observed_at": pl.Date,
    "unit": pl.String,
}


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
        observed = [name for name, feature in features.items() if feature.is_observation]
        rows.append(
            {
                "event_id": event["event_id"],
                "as_of": as_of,
                **{name: feature.value for name, feature in features.items()},
                **{f"{name}_available_at": feature.available_at for name, feature in features.items()},
                **{f"{name}_is_observation": feature.is_observation for name, feature in features.items()},
                # 관측 피처는 예보 계보(observation)를 만들 수 있게 출처·지역·관측일·단위를 함께 둔다.
                **{
                    f"{name}_{field}": getattr(features[name], field)
                    for name in observed
                    for field in LINEAGE_FIELDS
                },
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
        **{f"{name}_{field}": dtype for name in observed for field, dtype in LINEAGE_FIELDS.items()},
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


# 외부 관측·분할 기준은 보존하고 행사 속성만 파일명 날짜 가정으로 가린다.
def filename_sensitivity(
    frame: pl.DataFrame,
    names: list[str],
    events: dict[str, dict[str, Any]],
    filename_dates: dict[int, str],
) -> pl.DataFrame:
    rows = []
    schedule = {"duration", "weekend_days", "month", "holiday_days", "holiday_streak"}
    for row in frame.to_dicts():
        event = events[row["event_id"]]
        year = event.get("year", event["start"].year)
        available = publication_date(
            filename_dates.get(year) if "문체부" in (event.get("source") or []) else None
        )
        date_available = (
            publication_date(event.get("date_available_at"))
            if event.get("date_source") == "TourAPI"
            else available
        )
        row["event_attributes_available_at"] = available
        row["event_attributes_masked"] = available is None or available > row["as_of"]
        row["schedule_attributes_masked"] = date_available is None or date_available > row["as_of"]
        for name in names:
            if row[f"{name}_is_observation"]:
                continue
            day = date_available if name in schedule else available
            # 발표치 규모 계층에는 파일명 가정을 실제 공개일로 전달하지 않는다.
            if name not in {"visitors_announced", "log_visitors_announced"}:
                row[f"{name}_available_at"] = day
            if day is None or day > row["as_of"]:
                row[name] = None
        rows.append(row)
    return pl.DataFrame(
        rows,
        schema={
            **frame.schema,
            "event_attributes_available_at": pl.Date,
            "event_attributes_masked": pl.Boolean,
            "schedule_attributes_masked": pl.Boolean,
        },
    )
