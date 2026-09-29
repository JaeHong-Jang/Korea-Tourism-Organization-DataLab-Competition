"""시점별 공개 제약과 겹침 군집을 적용해 연구용 분할 ID를 만든다."""

from collections import defaultdict
from datetime import date, timedelta
from math import ceil

import polars as pl


# 동일 지역의 연속된 겹침 기간을 하나의 분할 단위로 연결한다.
def assign_clusters(frame: pl.DataFrame) -> pl.DataFrame:
    regions = defaultdict(list)
    for row in frame.to_dicts():
        regions[row["sigungu_code"]].append(row)
    mapping, cluster = {}, -1
    for region in sorted(regions):
        end = None
        for row in sorted(regions[region], key=lambda r: (r["start"], r["end"], r["event_id"])):
            if end is None or row["start"] > end:
                cluster += 1
                end = row["end"]
            else:
                end = max(end, row["end"])
            mapping[row["event_id"]] = cluster
    return frame.with_columns(pl.col("event_id").replace_strict(mapping).alias("cluster_id"))


# 분할 간 행사·관측 군집 중복과 정답 공개일 위반을 실행 시점에 중단한다.
def validate_split(frame: pl.DataFrame, split: dict) -> None:
    groups = {}
    for name in ("train", "calibration", "evaluation"):
        subset = frame.filter(pl.col("event_id").is_in(split[name]))
        assert subset.height == len(split[name])
        groups[name] = set(subset["cluster_id"])
        if name != "evaluation" and subset.height:
            assert subset["available_at"].max() <= split["cutoff"]
    assert not (groups["train"] & groups["calibration"])
    assert not (groups["train"] & groups["evaluation"])
    assert not (groups["calibration"] & groups["evaluation"])


# 월별 후보에서 최근 군집을 보정으로 떼고 동일한 후보의 연도 분할도 비교할 수 있게 한다.
def make_split(frame: pl.DataFrame, month: date, *, annual: bool = False, cutoff: date | None = None) -> dict:
    cutoff = cutoff or ((date(month.year, 1, 1) if annual else month) - timedelta(days=14))
    evaluation = frame.filter((pl.col("start").dt.year() == month.year) & (pl.col("start").dt.month() == month.month))
    evaluation_groups = set(evaluation["cluster_id"])
    available = frame.filter(pl.col("available_at") <= cutoff)
    candidates, excluded = [], []
    for group in frame.partition_by("cluster_id"):
        past = group.filter(pl.col("available_at") <= cutoff)
        if not past.height:
            continue
        if past.height != group.height or group["cluster_id"][0] in evaluation_groups:
            excluded.extend(past["event_id"].to_list())
        else:
            candidates.append(group)
    candidates.sort(key=lambda g: (g["available_at"].max(), g["end"].max(), g["event_id"].min()))
    if annual:
        calibration = [g for g in candidates if g["year"].max() == month.year - 1]
        training = [g for g in candidates if g["year"].max() <= month.year - 2]
    else:
        n_cal = min(len(candidates), max(50, ceil(len(candidates) * 0.2)))
        calibration = candidates[-n_cal:] if n_cal else []
        training = candidates[:-n_cal] if n_cal else candidates
    split = {
        "month": month.isoformat(), "cutoff": cutoff,
        "train": [i for g in training for i in g["event_id"]],
        "calibration": [i for g in calibration for i in g["event_id"]],
        "evaluation": evaluation["event_id"].to_list(), "excluded_boundary": excluded,
        "train_clusters": len(training), "calibration_clusters": len(calibration),
        "available_candidates": available.height,
    }
    validate_split(frame, split)
    assert len(split["train"]) + len(split["calibration"]) + len(excluded) == available.height
    return split
