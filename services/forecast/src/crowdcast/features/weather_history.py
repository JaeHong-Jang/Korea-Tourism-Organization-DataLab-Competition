"""완전한 과거 일강수량과 학습 가능한 실버 순증만 유형별 우천 비교 표본으로 묶는다."""

from datetime import date, timedelta
from typing import Any

import polars as pl


# 강수 표의 키·날짜·단위를 고정해 누락이나 중복을 건조한 날로 오인하지 않는다.
def daily_rain(frame: pl.DataFrame) -> dict[tuple[str, date], float]:
    required = {"sigungu_code", "date", "precipitation_mm"}
    if not required <= set(frame.columns):
        raise ValueError("weather_daily에는 sigungu_code·date·precipitation_mm(mm/일)이 필요합니다")
    frame = frame.select(
        pl.col("sigungu_code").cast(pl.String), pl.col("date").cast(pl.Date),
        pl.col("precipitation_mm").cast(pl.Float64),
    )
    if frame.select(pl.struct("sigungu_code", "date").is_duplicated().any()).item():
        raise ValueError("weather_daily 시군구·날짜 키 중복")
    valid = frame.filter(
        pl.col("sigungu_code").is_not_null() & pl.col("date").is_not_null()
        & pl.col("precipitation_mm").is_finite() & (pl.col("precipitation_mm") >= 0)
    )
    return {(row["sigungu_code"], row["date"]): row["precipitation_mm"] for row in valid.to_dicts()}


# 골든·명절·미공개·저품질 라벨을 빼고 행사 전체 기간의 강수를 확인한다.
def weather_samples(
    weather: pl.DataFrame, events: pl.DataFrame, labels: pl.DataFrame, *, as_of: date,
) -> pl.DataFrame:
    rain = daily_rain(weather)
    event_rows, label_rows = events.to_dicts(), labels.to_dicts()
    golden = {row["event_id"] for row in event_rows + label_rows if row.get("is_golden")}
    index = {row["event_id"]: row for row in event_rows}
    samples: list[dict[str, Any]] = []
    seen = set()
    for label in label_rows:
        event = index.get(label["event_id"])
        if (
            event is None or label["event_id"] in golden or label.get("label_tier") != "silver"
            or not label.get("is_primary") or not label.get("usable_for_training")
            or "holiday_overlap" in str(label.get("quality_flag", ""))
            or label.get("available_at") is None or label["available_at"] > as_of
            or not event.get("start") or not event.get("end") or event["end"] >= as_of
            or not 1 <= (event["end"] - event["start"]).days + 1 <= 14
            or event.get("continuity_break")
        ):
            continue
        if label["event_id"] in seen:
            raise ValueError("행사별 대표 실버 라벨 중복")
        seen.add(label["event_id"])
        days = [event["start"] + timedelta(days=offset)
                for offset in range((event["end"] - event["start"]).days + 1)]
        values = [rain.get((event["sigungu_code"], day)) for day in days]
        if any(value is None for value in values):
            continue
        samples.append({
            "type": event["type"], "rain_grade": "우천" if max(values) >= 0.1 else "무강수",
            "daily_mean": label["daily_mean"], "start": days[0], "end": days[-1],
        })
    return pl.DataFrame(samples, schema={
        "type": pl.String, "rain_grade": pl.String, "daily_mean": pl.Float64,
        "start": pl.Date, "end": pl.Date,
    }).filter(pl.col("daily_mean").is_finite() & (pl.col("daily_mean") > 0))
