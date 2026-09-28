"""원본 실버와 사전 공개 관측만으로 별도 연구 후보와 피처를 생성한다."""

import hashlib
import json
from datetime import timedelta
from pathlib import Path

import holidays
import numpy as np
import polars as pl

from crowdcast.features.availability import check_availability
from crowdcast.features.calendar_features import calendar_features
from crowdcast.features.event_features import CATEGORIES
from crowdcast.research.silver_expansion.regional import prepare_regions, region_features


# 입력의 바이트 해시를 저장해 연구 결과와 원본 스냅샷을 연결한다.
def source_hashes(root: Path) -> dict[str, str]:
    return {name: hashlib.sha256((root / "data/processed" / name).read_bytes()).hexdigest()
            for name in ("labels.parquet", "events.parquet", "region_daily.parquet")}


# 타깃·SNR은 진단 열에만 두고 모델 입력에는 사전 일정과 공개 지역 관측만 넣는다.
def build_dataset(root: Path, output: Path) -> tuple[pl.DataFrame, list[str], dict]:
    processed = root / "data/processed"
    labels = pl.read_parquet(processed / "labels.parquet")
    events = pl.read_parquet(processed / "events.parquet")
    golden = set(labels.filter(pl.col("is_golden"))["event_id"])
    golden.update(events.filter(pl.col("is_golden"))["event_id"])
    selected = labels.filter((pl.col("label_tier") == "silver") & ~pl.col("event_id").is_in(list(golden)))
    index = {r["event_id"]: r for r in events.to_dicts()}
    regions = prepare_regions(pl.read_parquet(processed / "region_daily.parquet"))
    assert selected["event_id"].n_unique() == selected.height
    rows, names, checked = [], [], 0
    for label in sorted(selected.to_dicts(), key=lambda r: r["event_id"]):
        event = index[label["event_id"]]
        start, end, code = event["start"], event["end"], event["sigungu_code"]
        if not start or not end or end < start or not code or label["available_at"] is None:
            raise ValueError(f"구조적 후보 오류: {label['event_id']}")
        if not np.isfinite(label["daily_mean"]):
            raise ValueError(f"비유한 타깃: {label['event_id']}")
        as_of = start - timedelta(days=14)
        observations = region_features(code, as_of, regions, continuity_break=bool(event["continuity_break"]))
        check_availability(observations, as_of)
        checked += sum(f.value is not None for f in observations.values())
        values = {k: f.value for k, f in calendar_features(event, as_of).items()}
        values.update({k: f.value for k, f in observations.items()})

        # 범주는 고정 목록으로 변환하고 발표시점 미상의 예산·사후 발표 인원은 포함하지 않는다.
        for category, allowed in CATEGORIES.items():
            for number, name in enumerate(allowed):
                values[f"{category}_{number}"] = float(event.get(category) == name)
            values[f"{category}_unknown"] = float(event.get(category) not in allowed)
        values["edition"] = event.get("edition")
        calendar = holidays.KR(years=range(start.year, end.year + 1), language="ko")
        values["lunar_holiday"] = float(any(
            start <= day <= end and ("설날" in name or "추석" in name)
            for day, name in calendar.items()
        ))
        region = regions.get(code)
        visible = region.filter(
            (pl.col("date") >= as_of - timedelta(days=56)) & (pl.col("date") < as_of)
            & (pl.col("available_at") <= as_of)
        ) if region is not None else pl.DataFrame()
        values["region_observation_days"] = float(visible.height)
        values["region_observation_age"] = float((as_of - visible["date"].max()).days) if visible.height else None
        names = list(values)
        rows.append({
            "event_id": label["event_id"], "name": event["name"], "event_type": event["type"],
            "year": start.year, "start": start, "end": end, "as_of": as_of,
            "available_at": label["available_at"], "sigungu_code": code,
            "window_id": f"{code}:{start}:{end}", "target": float(label["daily_mean"]),
            "snr": label["snr"], "holiday": "holiday_overlap" in label["quality_flag"],
            "quality_flag": label["quality_flag"], **values,
            **{f"{k}_available_at": f.available_at for k, f in observations.items()},
        })

    # 모든 행을 보존한 상태로 원단위 타깃·결측 피처·공개일을 별도 산출물에 남긴다.
    frame = pl.DataFrame(rows, infer_schema_length=None).with_columns(pl.col(names).cast(pl.Float64))
    if frame.select(pl.any_horizontal([pl.col(n).is_infinite() | pl.col(n).is_nan() for n in names]).any()).item():
        raise ValueError("입력 피처에 비유한 수치가 있습니다")
    audit = {
        "rows": frame.height, "negative_targets": frame.filter(pl.col("target") < 0).height,
        "golden_excluded": len(golden), "observations_checked": checked, "availability_violations": 0,
        "features": names, "missing_counts": {n: frame[n].null_count() for n in names},
        "assumption": "event request attributes known at D-14; historical publication vintage unavailable",
        "excluded_inputs": ["budget", "announced_visitors", "history_visitors", "SNR", "event-period observations"],
        "source_hashes": source_hashes(root),
    }
    frame.write_parquet(output / "candidates.parquet")
    (output / "feature_audit.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8")
    return frame, names, audit
