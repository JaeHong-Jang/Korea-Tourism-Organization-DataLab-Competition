"""행사 전 같은 요일 기준선과 잔차 표준편차로 시군구 순증 실버 라벨을 만든다."""

import json
import math
import statistics
from collections import Counter
from datetime import date, timedelta
from typing import Any

import holidays
import polars as pl
from crowdcast.labels.schema import flag, label_row

CATEGORIES = {"현지인": "local", "외지인": "nonlocal", "외국인": "foreign"}


# 부모 시와 구를 합산하지 않고 입력 코드별로 완전한 세 구분의 하루만 구성한다.
def daily_index(frame: pl.DataFrame) -> dict[str, dict[date, dict[str, Any]]]:
    keys = ["sigungu_code", "date", "tou_div"]
    if frame.select(pl.struct(keys).is_duplicated().any()).item():
        raise ValueError("region_daily의 코드·날짜·방문자 구분 키 중복")
    if frame.filter(~pl.col("tou_div").is_in(list(CATEGORIES))).height:
        raise ValueError("region_daily 방문자 구분 오류")
    grouped = (
        frame.with_row_index("row", offset=1)
        .group_by("sigungu_code", "date")
        .agg(
            pl.len().alias("count"),
            pl.col("continuity_break").any(),
            pl.col("row").sort(),
            (pl.col("visitors").is_finite() & (pl.col("visitors") >= 0))
            .fill_null(False)
            .all()
            .alias("valid"),
            *[
                pl.col("visitors").filter(pl.col("tou_div") == name).first().alias(field)
                for name, field in CATEGORIES.items()
            ],
        )
    )
    index: dict[str, dict[date, dict[str, Any]]] = {}
    for row in grouped.iter_rows(named=True):
        row["complete"] = row["count"] == 3 and row["valid"]
        if row["complete"]:
            row["total"] = math.fsum(row[field] for field in CATEGORIES.values())
        index.setdefault(row["sigungu_code"], {})[row["date"]] = row
    return index


# 대상 요일별 최소 3일을 요구하며 행사 시작일 이후 값은 기준선에 절대 넣지 않는다.
def baseline(
    event_days: list[date],
    observations: dict[date, dict[str, Any]],
    calendar: holidays.HolidayBase,
) -> tuple[dict[int, dict[str, float]], list[dict[str, Any]], float] | None:
    start = event_days[0]
    weekdays = sorted({day.weekday() for day in event_days})
    samples = [
        observations[day]
        for offset in range(28, 0, -1)
        if (day := start - timedelta(days=offset)) in observations
        and day not in calendar
        and day.weekday() in weekdays
        and observations[day]["complete"]
    ]
    centers = {}
    residuals = []
    for weekday in weekdays:
        group = [row for row in samples if row["date"].weekday() == weekday]
        if len(group) < 3:
            return None
        centers[weekday] = {
            field: statistics.median(row[field] for row in group) for field in ("total", *CATEGORIES.values())
        }
        residuals.extend(row["total"] - centers[weekday]["total"] for row in group)
    return centers, samples, statistics.stdev(residuals)


# 구조적 제외는 첫 사유 하나로 집계해 후보 수와 누락 수의 합을 맞춘다.
def event_exclusion(event: dict[str, Any]) -> str | None:
    if event["start"] is None or event["end"] is None:
        return "일정 미확정"
    if not 1 <= (event["end"] - event["start"]).days + 1 <= 14:
        return "기간 범위 밖(1~14일)"
    if not event["sigungu_code"]:
        return "시군구 코드 없음"
    if event["continuity_break"]:
        return "continuity_break"
    return None


# 계산 가능한 후보를 모두 보존해 음수·저신호 비율을 필터 이전 모집단에서 측정한다.
def build_silver(
    events: list[dict[str, Any]],
    frame: pl.DataFrame,
    source: str,
    *,
    diagnostics: list[dict[str, Any]] | None = None,
) -> tuple[list[dict[str, Any]], Counter[str]]:
    index = daily_index(frame)
    years = {
        year
        for event in events
        if event["start"]
        for year in range(
            (event["start"] - timedelta(days=28)).year, (event["end"] or event["start"]).year + 1
        )
    }
    calendar = holidays.KR(years=sorted(years), language="ko")
    labels, excluded = [], Counter()
    for event in sorted(events, key=lambda row: row["event_id"]):
        if reason := event_exclusion(event):
            excluded[reason] += 1
            continue
        observations = index.get(event["sigungu_code"], {})
        days = [event["start"] + timedelta(days=n) for n in range((event["end"] - event["start"]).days + 1)]
        window = [
            observations[day]
            for offset in range(-28, len(days))
            if (day := days[0] + timedelta(days=offset)) in observations
        ]
        if any(row["continuity_break"] for row in window):
            excluded["continuity_break"] += 1
            continue
        if any(day not in observations or not observations[day]["complete"] for day in days):
            excluded["행사 기간 일별 세 구분 누락·수치 오류"] += 1
            continue
        result = baseline(days, observations, calendar)
        if result is None:
            excluded["같은 요일 기준선 3일 미만"] += 1
            continue
        row = silver_row(event, days, observations, result, source)
        overlap = [day for day in days if any(name in calendar.get(day, "") for name in ("설날", "추석"))]
        if overlap:
            flag(row, "holiday_overlap")
        labels.append(row)
        if diagnostics is not None:
            centers, samples, sigma = result
            diagnostics.append(
                {
                    "event_id": event["event_id"],
                    "festival_name": event["name"],
                    "year": event["year"],
                    "sido": event["sido"],
                    "type": event.get("type") or "기타",
                    "start": days[0].isoformat(),
                    "end": days[-1].isoformat(),
                    "daily_mean": row["daily_mean"],
                    "sigma": sigma,
                    "snr": row["snr"],
                    "baseline_mean": statistics.fmean(centers[day.weekday()]["total"] for day in days),
                    "baseline_sample_count": len(samples),
                    "holiday_dates": [day.isoformat() for day in overlap],
                }
            )
    return labels, excluded


# 잔차 표준편차는 필요한 요일의 기준선 표본을 중복 없이 모아 ddof=1로 계산한다.
def silver_row(
    event: dict[str, Any],
    days: list[date],
    observations: dict[date, dict[str, Any]],
    result: tuple[dict[int, dict[str, float]], list[dict[str, Any]], float],
    source: str,
) -> dict[str, Any]:
    centers, samples, sigma = result
    period = [observations[day] for day in days]
    source_rows = sorted({position for row in period + samples for position in row["row"]})
    row = label_row(event, "silver", source, json.dumps(source_rows, separators=(",", ":")))
    differences = {
        field: [observations[day][field] - centers[day.weekday()][field] for day in days]
        for field in ("total", *CATEGORIES.values())
    }
    daily = statistics.fmean(differences["total"])
    row.update(
        daily_mean=daily,
        total=math.fsum(differences["total"]),
        days=len(days),
        snr=daily / sigma if sigma > 0 else None,
        method=f"시군구={event['sigungu_code']}; 행사={days[0]}~{days[-1]}; "
        "시작 전 28일 같은 요일 중앙값 차감; KR 공휴일 제외; "
        f"기준선 표본={len(samples)}; 잔차 표본 표준편차(ddof=1); "
        f"부모 합계 직접 사용={event.get('sigungu_match') == 'parent'}",
    )
    row.update({field: statistics.fmean(differences[field]) for field in CATEGORIES.values()})
    if daily <= 3 * sigma:
        flag(row, "snr_not_gt_3")
    if daily < 0:
        flag(row, "negative_increment")
    if sigma == 0:
        flag(row, "zero_baseline_std", exclude=False)
    return row
