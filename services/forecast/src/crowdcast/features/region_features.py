"""지역 일별 자료의 중복·연속성·공개일을 검사하고 행사 전 평시 지표를 만든다."""

from datetime import date, timedelta

import polars as pl
from crowdcast.features.availability import Feature


# 지역별 조회 전에 일별 세 방문자 집단을 한 번만 합산해 부모 시와 구를 섞지 않는다.
def prepare_regions(frame: pl.DataFrame) -> dict[str, pl.DataFrame]:
    if frame.is_empty():
        return {}
    if frame.select(pl.struct("sigungu_code", "date", "tou_div").is_duplicated().any()).item():
        raise ValueError("지역 방문자 키 중복")
    if frame.filter(~pl.col("visitors").is_finite() | (pl.col("visitors") < 0)).height:
        raise ValueError("지역 방문자는 유한한 음수 아닌 수여야 합니다")
    clean = frame.filter(~pl.col("continuity_break")) if "continuity_break" in frame.columns else frame
    daily = (
        clean.group_by("sigungu_code", "date")
        .agg(
            pl.col("visitors").sum().alias("total"),
            pl.col("visitors").filter(pl.col("tou_div") == "외지인").sum().alias("nonlocal"),
            pl.col("available_at").max(),
            pl.col("available_at").null_count().alias("missing_dates"),
            pl.col("tou_div").n_unique().alias("groups"),
        )
        .filter((pl.col("missing_dates") == 0) & (pl.col("groups") == 3))
    )
    return {
        key[0]: group.sort("date") for key, group in daily.partition_by("sigungu_code", as_dict=True).items()
    }


# 기준일 전 여덟 주 중 기준일까지 공개된 관측일만 집계한다.
def region_features(
    code: str | None,
    as_of: date,
    regions: dict[str, pl.DataFrame],
    *,
    continuity_break: bool = False,
) -> dict[str, Feature]:
    result = {key: Feature(None, None) for key in ("region_daily_mean", "nonlocal_share", "weekend_ratio")}
    if code not in regions or continuity_break:
        return result
    frame = regions[code].filter(
        (pl.col("date") >= as_of - timedelta(weeks=8))
        & (pl.col("date") < as_of)
        & (pl.col("available_at") <= as_of)
    )
    if frame.is_empty():
        return result
    latest = frame["available_at"].max()
    result["region_daily_mean"] = Feature(float(frame["total"].mean()), latest)
    total = frame["total"].sum()
    if total > 0:
        result["nonlocal_share"] = Feature(float(frame["nonlocal"].sum() / total), latest)
    weekend = frame.filter(pl.col("date").dt.weekday() >= 6)["total"].mean()
    weekday = frame.filter(pl.col("date").dt.weekday() < 6)["total"].mean()
    if weekend is not None and weekday is not None and weekday > 0:
        result["weekend_ratio"] = Feature(float(weekend / weekday), latest)
    return result
