"""같은 행사 시리즈의 앞선 회차 관측을 D-14 공개 제약 아래에서 입력으로 만든다."""

from collections import defaultdict

import polars as pl

from crowdcast.research.silver_expansion.diagnostics import series_key

PRIOR_NAMES = ["prior_target", "prior_count"]


# 이번 회차 전에 끝났고 정답이 기준일 전에 공개된 앞선 회차만 이력으로 인정한다.
def add_prior_features(frame: pl.DataFrame) -> tuple[pl.DataFrame, dict]:
    groups = defaultdict(list)
    for row in frame.to_dicts():
        groups[series_key(row)].append(row)
    values = {}
    for rows in groups.values():
        for row in rows:
            history = [
                h
                for h in rows
                if h["event_id"] != row["event_id"]
                and h["end"] < row["start"]
                and h["available_at"] <= row["as_of"]
            ]
            latest = max(history, key=lambda h: (h["start"], h["event_id"])) if history else None
            values[row["event_id"]] = {
                "prior_target": latest["target"] if latest else None,
                "prior_count": float(len(history)),
                "prior_available_at": latest["available_at"] if latest else None,
            }

    # 행 순서를 유지한 채 열을 붙이고 공개일 위반이 하나라도 있으면 중단한다.
    ids = frame["event_id"].to_list()
    result = frame.with_columns(
        pl.Series("prior_target", [values[i]["prior_target"] for i in ids], dtype=pl.Float64),
        pl.Series("prior_count", [values[i]["prior_count"] for i in ids], dtype=pl.Float64),
        pl.Series("prior_available_at", [values[i]["prior_available_at"] for i in ids], dtype=pl.Date),
    )
    violations = result.filter(pl.col("prior_available_at") > pl.col("as_of")).height
    if violations:
        raise ValueError(f"앞선 회차 공개일 위반 {violations}건")
    audit = {
        "rows_with_prior": result.filter(pl.col("prior_target").is_not_null()).height,
        "series": len(groups),
        "availability_violations": 0,
        "rule": "same name+region series; ended before start; label available_at <= D-14",
    }
    return result, audit
