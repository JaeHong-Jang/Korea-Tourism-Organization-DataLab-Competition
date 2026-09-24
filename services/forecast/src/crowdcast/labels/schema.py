"""라벨의 타입·단위·학습 제외 불변식과 공통 메타데이터를 정의한다."""

import math
from datetime import timedelta
from typing import Any

import pandera.polars as pa
import polars as pl
from crowdcast.data.visitors import VISITORS_LAG_DAYS

# 골드 공개 지연은 확인 전 가정이며 실버는 지역 방문자 API의 지연 상수를 공유한다.
GOLD_LAG_DAYS = 180
DECIMALS = 6
FLOAT_COLUMNS = ("daily_mean", "total", "local", "nonlocal", "foreign", "snr")
DTYPES = {
    "event_id": pl.String,
    "label_tier": pl.String,
    "daily_mean": pl.Float64,
    "total": pl.Float64,
    "days": pl.Int64,
    "local": pl.Float64,
    "nonlocal": pl.Float64,
    "foreign": pl.Float64,
    "definition": pl.String,
    "method": pl.String,
    "snr": pl.Float64,
    "quality_flag": pl.String,
    "year": pl.Int64,
    "time_unit": pl.String,
    "spatial_scope": pl.String,
    "kind": pl.String,
    "source_file": pl.String,
    "source_row": pl.String,
    "available_at": pl.Date,
    "is_primary": pl.Boolean,
    "is_golden": pl.Boolean,
    "usable_for_training": pl.Boolean,
    "covid_period": pl.Boolean,
}


# 쉼표를 허용하되 결측과 잘못된 수치를 구별해 조용히 0으로 바꾸지 않는다.
def number(value: str | None) -> float | None:
    raw = (value or "").strip().replace(",", "")
    if raw in {"", "N/A", "NA", "-"}:
        return None
    result = float(raw)
    if not math.isfinite(result):
        raise ValueError("방문자 수는 유한한 숫자여야 합니다")
    return result


# 연도와 일수에서 소수점 잘림이 생기지 않도록 정수 여부를 확인한다.
def integer(value: str | None) -> int:
    result = number(value)
    if result is None or not result.is_integer():
        raise ValueError("연도·일수는 정수여야 합니다")
    return int(result)


# 종료일을 모르는 골드는 보존하되 공개 시점을 지어내거나 학습에 투입하지 않는다.
def label_row(event: dict[str, Any], tier: str, source: str, row: str) -> dict[str, Any]:
    end = event["end"]
    lag = VISITORS_LAG_DAYS if tier == "silver" else GOLD_LAG_DAYS
    result = dict.fromkeys(DTYPES)
    result.update(
        event_id=event["event_id"],
        label_tier=tier,
        definition="일평균",
        method="",
        quality_flag="ok" if end else "end_date_missing",
        year=event["year"],
        time_unit="일",
        spatial_scope={"goldA": "행사장", "goldB": "지정영역", "silver": "시군구"}[tier],
        kind="사후 집계",
        source_file=source,
        source_row=row,
        available_at=end + timedelta(days=lag) if end else None,
        is_primary=False,
        is_golden=False,
        usable_for_training=bool(end),
        covid_period=event["year"] in {2020, 2021},
    )
    return result


# 여러 품질 사유는 정렬된 구분자로 합치고 학습 제외 여부는 호출부에서 결정한다.
def flag(row: dict[str, Any], reason: str, *, exclude: bool = True) -> None:
    reasons = set(row["quality_flag"].split(";")) - {"ok"}
    row["quality_flag"] = ";".join(sorted(reasons | {reason}))
    if exclude:
        row["usable_for_training"] = False


# 실버의 음수와 잡음 0의 SNR 결측만 허용하고 모든 실제 수치는 유한해야 한다.
def finite(data: pa.PolarsData) -> pl.LazyFrame:
    return data.lazyframe.select(pl.col(data.key).is_finite())


# 골든·음수·공개일 미상·명절 겹침 행은 학습에 쓰이지 않는다.
def training_check(data: pa.PolarsData) -> pl.LazyFrame:
    return data.lazyframe.select(
        ~pl.col("usable_for_training")
        | (
            ~pl.col("is_golden")
            & (pl.col("daily_mean") > 0)
            & pl.col("available_at").is_not_null()
            & ~pl.col("quality_flag").str.contains("holiday_overlap")
        )
    )


# 등급을 모두 보존하면서 행사마다 대표 라벨을 정확히 하나만 둔다.
def primary_check(data: pa.PolarsData) -> pl.LazyFrame:
    return (
        data.lazyframe.group_by("event_id")
        .agg((pl.col("is_primary").sum() == 1).alias("valid"))
        .select("valid")
    )


# 표 전체 검증을 파일 기록보다 먼저 호출하는 엄격한 Pandera 계약이다.
LABEL_SCHEMA = pa.DataFrameSchema(
    {
        name: pa.Column(dtype, nullable=name in {"local", "nonlocal", "foreign", "snr", "available_at"})
        for name, dtype in DTYPES.items()
    },
    checks=[
        pa.Check(
            lambda d: d.lazyframe.select((pl.col("label_tier") == "silver") | (pl.col("daily_mean") > 0)),
            name="positive_gold",
        ),
        pa.Check(training_check, name="training_exclusions"),
        pa.Check(primary_check, name="one_primary_per_event"),
        pa.Check(
            lambda d: d.lazyframe.select(pl.col("covid_period") == pl.col("year").is_in([2020, 2021])),
            name="covid_year",
        ),
    ],
    unique=["event_id", "label_tier"],
    strict=True,
)
for _column in FLOAT_COLUMNS:
    LABEL_SCHEMA = LABEL_SCHEMA.update_column(_column, checks=pa.Check(finite))
for _column, _values in {
    "label_tier": ["goldA", "goldB", "silver"],
    "definition": ["일평균"],
    "time_unit": ["일"],
    "spatial_scope": ["행사장", "지정영역", "시군구"],
    "kind": ["사후 집계"],
}.items():
    LABEL_SCHEMA = LABEL_SCHEMA.update_column(_column, checks=pa.Check.isin(_values))
LABEL_SCHEMA = LABEL_SCHEMA.update_column("days", checks=pa.Check.gt(0))
for _column in ("event_id", "source_file", "source_row", "method", "quality_flag"):
    LABEL_SCHEMA = LABEL_SCHEMA.update_column(_column, checks=pa.Check.str_length(min_value=1))


# 타입을 강제 변환하지 않아 잘못된 호출부의 타입도 스키마 오류로 드러낸다.
def validate_labels(frame: pl.DataFrame) -> pl.DataFrame:
    return LABEL_SCHEMA.validate(frame, lazy=True)
