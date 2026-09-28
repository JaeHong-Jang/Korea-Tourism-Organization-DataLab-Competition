"""현재 실버 후보의 분포·관측 중복·공개 시점별 표본 수를 원본 수정 없이 집계한다."""

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

import polars as pl


# 원본 해시를 기록해 집계에 사용한 스냅샷을 식별한다.
def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


# 필터를 해제할 때 남는 표본 수를 계산하되 라벨과 학습 파일을 바꾸지 않는다.
def audit(root: Path, today: date) -> dict:
    processed = root / "data/processed"
    labels = pl.read_parquet(processed / "labels.parquet")
    events = pl.read_parquet(processed / "events.parquet")
    silver = labels.filter(pl.col("label_tier") == "silver").join(
        events.select("event_id", "name", "start", "end", "sigungu_code"),
        on="event_id", how="left", validate="m:1",
    )
    assert silver["event_id"].n_unique() == silver.height
    rows = silver.to_dicts()
    assert all(r["start"] and r["end"] and r["sigungu_code"] for r in rows)
    assert silver["daily_mean"].is_finite().all()
    summary = {
        "as_of": today.isoformat(),
        "data_root": str(root),
        "hashes": {name: digest(processed / name) for name in ("labels.parquet", "events.parquet")},
        "scope": "read-only candidate audit; no model fitting or preprocessing output replacement",
        "silver_n": silver.height,
        "positive_n": sum(r["daily_mean"] > 0 for r in rows),
        "zero_n": sum(r["daily_mean"] == 0 for r in rows),
        "negative_n": sum(r["daily_mean"] < 0 for r in rows),
        "holiday_n": sum("holiday_overlap" in r["quality_flag"] for r in rows),
        "current_primary_usable_n": sum(r["is_primary"] and r["usable_for_training"] for r in rows),
        "gold_primary_usable_n": labels.filter(
            (pl.col("label_tier") != "silver") & pl.col("is_primary") & pl.col("usable_for_training")
        ).height,
        "golden_holdout_n": labels.filter(pl.col("is_golden")).height,
        "available_today_n": sum(r["available_at"] is not None and r["available_at"] <= today for r in rows),
        "flag_counts": dict(Counter(flag for r in rows for flag in r["quality_flag"].split(";"))),
    }
    summary["gold_primary_usable_events"] = labels.filter(
        (pl.col("label_tier") != "silver") & pl.col("is_primary") & pl.col("usable_for_training")
    ).join(events.select("event_id", "name"), on="event_id").select("event_id", "year", "name").to_dicts()

    # SNR 구간은 표본 분포를 진단하는 데만 쓰고 학습 선택을 바꾸지 않는다.
    summary["snr_bands"] = dict(Counter(
        "missing" if r["snr"] is None else
        "<=0" if r["snr"] <= 0 else
        "(0,1]" if r["snr"] <= 1 else
        "(1,2]" if r["snr"] <= 2 else
        "(2,3]" if r["snr"] <= 3 else ">3"
        for r in rows
    ))
    summary["by_year"] = []
    for year in sorted({r["year"] for r in rows}):
        group = [r for r in rows if r["year"] == year]
        summary["by_year"].append({
            "year": year, "n": len(group),
            "negative_n": sum(r["daily_mean"] < 0 for r in group),
            "holiday_n": sum("holiday_overlap" in r["quality_flag"] for r in group),
            "current_usable_n": sum(r["is_primary"] and r["usable_for_training"] for r in group),
        })

    # 같은 지역의 동일 기간과 부분 겹침을 구분해 행사 수와 관측 단위 수를 비교한다.
    keys = Counter((r["sigungu_code"], r["start"], r["end"]) for r in rows)
    summary["distinct_region_windows"] = len(keys)
    summary["exact_window_duplicate_extra_rows"] = sum(n - 1 for n in keys.values())
    summary["exact_window_duplicate_groups"] = sum(n > 1 for n in keys.values())
    summary["exact_window_duplicate_member_rows"] = sum(n for n in keys.values() if n > 1)
    values_by_window = defaultdict(set)
    for r in rows:
        values_by_window[(r["sigungu_code"], r["start"], r["end"])].add(r["daily_mean"])
    summary["same_window_inconsistent_targets"] = sum(len(v) > 1 for v in values_by_window.values())
    by_region = defaultdict(list)
    for r in rows:
        by_region[r["sigungu_code"]].append(r)
    overlap_ids = set()
    cluster_sizes = []
    for group in by_region.values():
        ordered = sorted(group, key=lambda r: (r["start"], r["end"]))
        cluster_end, size = None, 0
        for r in ordered:
            if cluster_end is None or r["start"] > cluster_end:
                if size:
                    cluster_sizes.append(size)
                cluster_end, size = r["end"], 1
            else:
                cluster_end, size = max(cluster_end, r["end"]), size + 1
            if any(other["event_id"] != r["event_id"] and other["start"] <= r["end"]
                   and other["end"] >= r["start"] for other in group):
                overlap_ids.add(r["event_id"])
        if size:
            cluster_sizes.append(size)
    summary["overlap_member_rows_within_silver"] = len(overlap_ids)
    summary["connected_interval_clusters"] = len(cluster_sizes)
    summary["max_cluster_rows"] = max(cluster_sizes)

    # 전체 일정 목록의 겹침은 행사 원인 판정이 아닌 기준선 오염 가능성 점검으로 센다.
    catalog_by_region = defaultdict(list)
    for event in events.to_dicts():
        if event["start"] and event["end"] and event["end"] >= event["start"] and event["sigungu_code"]:
            catalog_by_region[event["sigungu_code"]].append(event)
    catalog_overlap, baseline_overlap = 0, 0
    for r in rows:
        other_events = [e for e in catalog_by_region[r["sigungu_code"]] if e["event_id"] != r["event_id"]]
        catalog_overlap += any(e["start"] <= r["end"] and e["end"] >= r["start"] for e in other_events)
        baseline_overlap += any(
            e["start"] < r["start"] and e["end"] >= r["start"] - timedelta(days=28)
            for e in other_events
        )
    summary["overlap_member_rows_against_dated_catalog"] = catalog_overlap
    summary["prior_28_calendar_days_other_event_overlap_rows"] = baseline_overlap
    summary["catalog_overlap_caveat"] = "calendar overlap only; baseline weekday/holiday sample membership not checked; schedule announcement vintage unknown"

    # 연초 D-14 공개 제약을 적용해 연도별 총수와 실제 학습 후보 수를 구분한다.
    summary["year_start_train_pools"] = []
    for year in (2024, 2025, 2026):
        cutoff = date(year, 1, 1) - timedelta(days=14)
        eligible = [r for r in rows if r["available_at"] is not None and r["available_at"] <= cutoff]
        summary["year_start_train_pools"].append({
            "evaluation_year": year, "cutoff": cutoff.isoformat(),
            "available_prior_rows_before_calibration": len(eligible),
            "distinct_region_windows": len({(r["sigungu_code"], r["start"], r["end"]) for r in eligible}),
            "evaluation_year_candidate_n": sum(r["year"] == year for r in rows),
        })
    summary["unavailable_today"] = [
        {k: r[k] for k in ("event_id", "name", "end", "available_at")}
        for r in rows if r["available_at"] is None or r["available_at"] > today
    ]
    return summary


# 집계 결과는 이 감사 문서 폴더에만 저장하고 원본 데이터에는 쓰지 않는다.
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", type=Path, required=True)
    parser.add_argument("--as-of", type=date.fromisoformat, default=date(2026, 9, 28))
    args = parser.parse_args()
    result = audit(args.data_root, args.as_of)
    rendered = json.dumps(result, ensure_ascii=False, indent=2, default=str) + "\n"
    Path(__file__).with_name("audit.json").write_text(rendered, encoding="utf-8")
    print(rendered)
