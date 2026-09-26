"""등급 우선순위·골든 제외와 고정 반올림을 적용해 결정적 라벨 표를 만든다."""

from typing import Any

import polars as pl
from crowdcast.labels.schema import DECIMALS, DTYPES, FLOAT_COLUMNS, flag

PRIORITY = {"goldB": 0, "goldA": 1, "silver": 2}


# 같은 등급의 상충 원본은 묵살하지 않고 스키마의 키 유일성 검증으로 넘긴다.
def merge_labels(rows: list[dict[str, Any]], golden: set[str]) -> pl.DataFrame:
    ordered = sorted(
        rows,
        key=lambda row: (row["event_id"], PRIORITY[row["label_tier"]], row["source_file"], row["source_row"]),
    )
    merged, seen = [], set()
    for source in ordered:
        row = source.copy()
        row["is_primary"] = row["event_id"] not in seen
        seen.add(row["event_id"])
        row["is_golden"] = row["event_id"] in golden
        if row["is_golden"]:
            row["usable_for_training"] = False
        for field in FLOAT_COLUMNS:
            if row[field] is not None:
                rounded = round(row[field], DECIMALS)
                row[field] = 0.0 if rounded == 0 else rounded
        if row["label_tier"] == "silver" and row["daily_mean"] <= 0:
            flag(row, "nonpositive_increment")
        merged.append(row)
    return pl.DataFrame(merged, schema=DTYPES)
