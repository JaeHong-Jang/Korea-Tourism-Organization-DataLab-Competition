"""제안한 시간순 분할의 학습·보정·평가 후보 수를 원본 변경 없이 계산한다."""

import json
from collections import defaultdict
from datetime import date, timedelta
from math import ceil
from pathlib import Path

import polars as pl


# 동일 지역에서 기간이 연결되는 행사를 묶어 분할 간 중복 관측을 막는다.
def clusters_for(rows: list[dict]) -> list[list[dict]]:
    regions = defaultdict(list)
    for row in rows:
        regions[row["sigungu_code"]].append(row)
    clusters = []
    for region in sorted(regions):
        end = None
        for row in sorted(regions[region], key=lambda r: (r["start"], r["end"], r["event_id"])):
            if end is None or row["start"] > end:
                clusters.append([])
                end = row["end"]
            else:
                end = max(end, row["end"])
            clusters[-1].append(row)
    return clusters


# 공개된 과거 후보를 겹침 군집 단위로 정렬하고 최근 20%를 구간 보정에 예약한다.
def split_at(rows: list[dict], month: date, clusters: list[list[dict]]) -> dict:
    cutoff = month - timedelta(days=14)
    evaluation = [r for r in rows if (r["start"].year, r["start"].month) == (month.year, month.month)]
    evaluation_ids = {r["event_id"] for r in evaluation}
    candidates = [r for r in rows if r["available_at"] <= cutoff]
    candidate_ids = {r["event_id"] for r in candidates}
    past_clusters = []
    excluded = []
    for cluster in clusters:
        past = [r for r in cluster if r["event_id"] in candidate_ids]
        if not past:
            continue
        if any(r["event_id"] in evaluation_ids for r in cluster) or len(past) != len(cluster):
            excluded.extend(past)
        else:
            past_clusters.append(past)
    past_clusters.sort(key=lambda group: (
        max(r["available_at"] for r in group), max(r["end"] for r in group),
        min(r["event_id"] for r in group),
    ))
    n_cal = min(len(past_clusters), max(50, ceil(len(past_clusters) * 0.2)))
    train_groups = past_clusters[:-n_cal] if n_cal else past_clusters
    cal_groups = past_clusters[-n_cal:] if n_cal else []
    train = [r for group in train_groups for r in group]
    cal = [r for group in cal_groups for r in group]

    # 학습·보정·평가의 중복과 후보 수 합계를 검사해 건수를 과대 보고하지 않는다.
    train_ids = {r["event_id"] for r in train}
    cal_ids = {r["event_id"] for r in cal}
    assert not (train_ids & cal_ids or train_ids & evaluation_ids or cal_ids & evaluation_ids)
    assert len(candidates) == len(train) + len(cal) + len(excluded)
    return {
        "month": month.isoformat(), "cutoff": cutoff.isoformat(),
        "train_rows": len(train), "calibration_rows": len(cal),
        "train_clusters": len(train_groups), "calibration_clusters": len(cal_groups),
        "evaluation_rows_this_month": len(evaluation), "boundary_excluded_rows": len(excluded),
        "available_candidate_rows": len(candidates),
        "model_sample_gate_passed": len(train_groups) >= 100,
    }


# 기존 집계의 스냅샷을 읽어 연초 및 월별 후보 건수를 별도 JSON으로 남긴다.
if __name__ == "__main__":
    folder = Path(__file__).parent
    audit = json.loads((folder / "audit.json").read_text(encoding="utf-8"))
    processed = Path(audit["data_root"]) / "data/processed"
    labels = pl.read_parquet(processed / "labels.parquet")
    events = pl.read_parquet(processed / "events.parquet")
    rows = labels.filter(pl.col("label_tier") == "silver").join(
        events.select("event_id", "start", "end", "sigungu_code"),
        on="event_id", how="left", validate="m:1",
    ).to_dicts()
    assert len(rows) == 1804
    assert all(r["year"] == r["start"].year for r in rows)
    clusters = clusters_for(rows)
    assert len(clusters) == audit["connected_interval_clusters"]
    monthly = [split_at(rows, date(year, month, 1), clusters)
               for year in (2024, 2025, 2026) for month in range(1, 13)]
    active_months = [r for r in monthly if r["evaluation_rows_this_month"]]
    annual = []
    for year in (2024, 2025, 2026):
        months = [r for r in active_months if r["month"].startswith(str(year))]
        annual.append({
            "year": year,
            "year_start": next(r for r in monthly if r["month"] == f"{year}-01-01"),
            "annual_evaluation_rows": sum(r["evaluation_rows_this_month"] for r in months),
            "active_month_train_min": min(r["train_rows"] for r in months),
            "active_month_train_max": max(r["train_rows"] for r in months),
            "first_evaluation_month": months[0], "last_evaluation_month": months[-1],
        })
    result = {
        "status": "candidate split counts only; feature construction and model fitting not performed",
        "rounding_rule": "ceil(20% of past clusters); minimum 50 calibration clusters",
        "boundary_rule": "exclude past rows in evaluation clusters or incompletely published clusters",
        "annual": annual, "monthly_with_evaluations": active_months,
    }
    (folder / "split_counts.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8",
    )
    print(json.dumps(annual, ensure_ascii=False, indent=2))
