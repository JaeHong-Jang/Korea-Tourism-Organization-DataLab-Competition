"""기존 피처 생성기를 호출하고 열에 기록된 계보만 관측과 예측 실행으로 옮긴다."""

from datetime import date, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

import polars as pl
from crowdcast.api.assemble.evidence import datasets
from crowdcast.api.assemble.http import NoObservation
from crowdcast.api.assemble.identity import identifier
from crowdcast.api.assemble.inputs import feature_event, primary_labels, region_rows
from crowdcast.features import build
from crowdcast.features.announced import with_announced
from crowdcast.features.availability import Feature, check_availability
from crowdcast.features.region_features import prepare_regions, region_features


# 자료를 요청 기준일로 먼저 제한하고 행사 속성은 입력 그대로 피처 생성기에 넘긴다.
def feature_frame(event: dict[str, Any], as_of: date, names: list[str]) -> pl.DataFrame:
    current = feature_event(event)
    events, labels = primary_labels(as_of)
    # 단건·일괄 예보 모두 계약 행사와 식별자는 유지하고 내부 피처에만 전년 발표치를 보충한다.
    current = with_announced(current, events)
    events = [row for row in events if row["event_id"] != current["event_id"]] + [current]
    regions = region_rows(event["sigunguCode"], as_of).sort("date", "tou_div")
    # 학습 감사 파일을 덮지 않도록 요청별 임시 파일에 기존 생성기의 검사를 기록한다.
    with TemporaryDirectory(prefix="crowdcast-features-") as directory:
        frame, _ = build.build_features(
            events,
            labels,
            regions,
            {current["event_id"]},
            audit_path=Path(directory) / "availability.json",
        )

    # 조기 요청은 일정 피처를 유지하고 지역 창만 실제 asOf로 기존 함수에서 다시 계산한다.
    row = frame.row(0, named=True)
    if as_of < current["start"] - timedelta(days=14):
        early = region_features(
            current["sigungu_code"],
            as_of,
            prepare_regions(regions),
            continuity_break=current["continuity_break"],
        )
        for name, feature in early.items():
            row[name] = feature.value
            for attr in ("available_at", "is_observation", *build.LINEAGE_FIELDS):
                row[f"{name}_{attr}"] = getattr(feature, attr)
    row["as_of"] = as_of
    if any(name not in row for name in names):
        raise ValueError("사용 모델이 요구한 피처가 없습니다")
    check_availability(
        {
            name: Feature(row[name], row[f"{name}_available_at"], row[f"{name}_is_observation"])
            for name in names
        },
        as_of,
    )
    return pl.DataFrame([row], schema=frame.schema)


# 값 있는 관측 피처만 식별하며 출처·날짜·단위가 없으면 추측하지 않고 실패한다.
def observations(frame: pl.DataFrame, names: list[str], code: str) -> list[dict[str, Any]]:
    row = frame.row(0, named=True)
    result = []
    for name in names:
        if not row[f"{name}_is_observation"] or row[name] is None:
            continue
        metadata = {key: row[f"{name}_{key}"] for key in (*build.LINEAGE_FIELDS, "available_at")}
        if any(value is None for value in metadata.values()):
            raise ValueError("관측 피처 계보 누락")
        if metadata["dataset_id"] not in datasets() or metadata["sigungu_code"] != code:
            raise ValueError("관측 출처 또는 지역 불일치")
        content = {
            "featureName": name,
            "value": row[name],
            "unit": metadata["unit"],
            "datasetId": metadata["dataset_id"],
            "sigunguCode": metadata["sigungu_code"],
            "observedAt": metadata["observed_at"].isoformat(),
            "availableAt": metadata["available_at"].isoformat(),
        }
        result.append({"id": identifier("obs", content), **content})
    if not result:
        raise NoObservation()
    return result


# 모델 카드 id·학습 범위·검증 상태를 사용 포인터와 같은 버전으로 묶는다.
def prediction_run(
    forecast_id: str,
    as_of: date,
    card: dict[str, Any],
    pointer: dict[str, Any],
    observed: list[dict[str, Any]],
) -> dict[str, Any]:
    content = {
        "modelRunId": card["id"],
        "modelVersion": card["modelVersion"],
        "asOf": as_of.isoformat(),
        "observationIds": [row["id"] for row in observed],
        "trainRange": card["trainRange"],
        "modelVerdict": pointer["verdict"],
    }
    return {"id": identifier("pr", {"forecastId": forecast_id, **content}), **content}
