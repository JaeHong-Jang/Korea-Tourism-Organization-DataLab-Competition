"""외부 API 모듈 없이 공개된 완전 일별 관측으로 기존 지역 피처를 재현한다."""

from datetime import date, timedelta

import polars as pl

from crowdcast.features.availability import Feature


# 방문자 세 집단이 모두 있고 공개일이 확인된 지역 일별 관측만 준비한다.
def prepare_regions(frame: pl.DataFrame) -> dict[str, pl.DataFrame]:
    if frame.select(pl.struct("sigungu_code", "date", "tou_div").is_duplicated().any()).item():
        raise ValueError("지역 일별 방문자 키 중복")
    if frame.filter(~pl.col("visitors").is_finite() | (pl.col("visitors") < 0)).height:
        raise ValueError("지역 방문자 원자료 오류")
    daily = frame.filter(~pl.col("continuity_break")).group_by("sigungu_code", "date").agg(
        pl.col("visitors").sum().alias("total"),
        pl.col("visitors").filter(pl.col("tou_div") == "외지인").sum().alias("nonlocal"),
        pl.col("available_at").max(), pl.col("available_at").null_count().alias("missing_dates"),
        pl.col("tou_div").n_unique().alias("groups"),
    ).filter((pl.col("missing_dates") == 0) & (pl.col("groups") == 3))
    return {key[0]: group.sort("date") for key, group in daily.partition_by("sigungu_code", as_dict=True).items()}


# 기존의 기준일 전 56일 창과 available_at 제약을 동시에 적용한다.
def region_features(code: str, as_of: date, regions: dict[str, pl.DataFrame], *, continuity_break: bool) -> dict[str, Feature]:
    if continuity_break:
        raise ValueError("본 실버 연구는 행정구역 연속성 단절 후보를 허용하지 않습니다")
    result = {name: Feature(None, None) for name in ("region_daily_mean", "nonlocal_share", "weekend_ratio")}
    if code not in regions:
        return result
    frame = regions[code].filter((pl.col("date") >= as_of - timedelta(days=56))
                                & (pl.col("date") < as_of) & (pl.col("available_at") <= as_of))
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
