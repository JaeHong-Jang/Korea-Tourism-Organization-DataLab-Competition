"""병합 우선순위·골든·코로나와 Pandera의 타입·키·학습 제외 계약을 검증한다."""

from datetime import date

import pandera.polars as pa
import polars as pl
import pytest
from crowdcast.labels.merge import merge_labels
from crowdcast.labels.schema import label_row, validate_labels
from label_fixtures import festival


# 각 등급을 별도 행으로 남기되 대표 하나와 골든의 전체 등급 학습 제외를 보장한다.
def test_priority_golden_and_covid() -> None:
    rows = []
    for tier in ("silver", "goldA", "goldB"):
        row = label_row(festival(year=2020, end=date(2020, 5, 5)), tier, "연천.csv", "2")
        row.update(daily_mean=100.0, total=400.0, days=4, method="일평균")
        row["snr"] = 10.0 if tier == "silver" else None
        rows.append(row)
    frame = validate_labels(merge_labels(rows, set()))
    assert frame.filter(pl.col("is_primary"))["label_tier"].to_list() == ["goldB"]
    assert frame["covid_period"].to_list() == [True] * 3
    assert frame["usable_for_training"].to_list() == [True] * 3
    golden = validate_labels(merge_labels(rows, {rows[0]["event_id"]}))
    assert golden["is_golden"].to_list() == [True] * 3
    assert not golden["usable_for_training"].any()
    assert merge_labels(rows[:2], set()).filter(pl.col("is_primary"))["label_tier"].to_list() == ["goldA"]


# 음수는 실버 비학습 행에만 허용하고 양의 골드·enum·타입·고유 키를 검사한다.
@pytest.mark.parametrize(
    "bad",
    [
        "negative_gold",
        "negative_training",
        "enum",
        "duplicate",
        "primary",
        "infinite",
        "type",
        "golden_training",
        "missing_primary",
        "zero_sigma_training",
        "missing_silver_snr",
    ],
)
def test_schema_rejects_invalid_labels(bad: str) -> None:
    row = label_row(festival(), "goldA", "연천.csv", "2")
    row.update(daily_mean=100.0, total=400.0, days=4, method="일평균")
    frame = merge_labels([row], set())
    if bad == "negative_gold":
        frame = frame.with_columns(pl.lit(-1.0).alias("daily_mean"))
    elif bad == "negative_training":
        frame = frame.with_columns(pl.lit("silver").alias("label_tier"), pl.lit(-1.0).alias("daily_mean"))
    elif bad == "enum":
        frame = frame.with_columns(pl.lit("시간").alias("time_unit"))
    elif bad == "duplicate":
        frame = pl.concat([frame, frame])
    elif bad == "primary":
        frame = pl.concat([frame, frame.with_columns(pl.lit("goldB").alias("label_tier"))])
    elif bad == "infinite":
        frame = frame.with_columns(pl.lit(float("inf")).alias("daily_mean"))
    elif bad == "type":
        frame = frame.with_columns(pl.col("days").cast(pl.String))
    elif bad == "golden_training":
        frame = frame.with_columns(pl.lit(True).alias("is_golden"))
    elif bad == "missing_primary":
        frame = frame.with_columns(pl.lit(False).alias("is_primary"))
    elif bad == "zero_sigma_training":
        frame = frame.with_columns(
            pl.lit("silver").alias("label_tier"),
            pl.lit(10.0).alias("snr"),
            pl.lit("zero_sigma").alias("quality_flag"),
        )
    elif bad == "missing_silver_snr":
        frame = frame.with_columns(pl.lit("silver").alias("label_tier"))
    with pytest.raises((pa.errors.SchemaErrors, pa.errors.SchemaError)):
        validate_labels(frame)


# 허용된 음수 실버·빈 결과와 반올림의 음수 0 정규화를 검증한다.
def test_negative_silver_empty_and_rounding() -> None:
    row = label_row(festival(), "silver", "방문자.parquet", "[1,2,3]")
    row.update(daily_mean=-1.0, total=-4.0, days=4, method="순증", usable_for_training=False)
    assert validate_labels(merge_labels([row], set())).height == 1
    assert validate_labels(merge_labels([], set())).height == 0
    row.update(daily_mean=-0.00000001, total=-0.00000004)
    result = validate_labels(merge_labels([row], set()))
    assert str(result["daily_mean"][0]) == "0.0"
