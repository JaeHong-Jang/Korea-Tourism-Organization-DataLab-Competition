"""라벨 행사의 같은 시군구에서 공개된 평시와 완전한 행사일 방문 구성을 짝짓는다."""

from datetime import timedelta
from typing import Any

import polars as pl
from crowdcast.analytics.baseline import complete_days, complete_window
from crowdcast.analytics.insights.records import Inputs
from crowdcast.api.assemble.inputs import BREAK_CODES, BREAK_DATE


# T-203 평시의 공개일 제한·완전한 28일 탐색·요일별 평균을 그대로 적용한다.
def calculate(inputs: Inputs) -> list[dict[str, Any]]:
    if inputs.region.is_empty() or inputs.labels.is_empty():
        return []
    regions = {
        key[0]: value for key, value in inputs.region.partition_by("sigungu_code", as_dict=True).items()
    }
    event_ids = {row["event_id"] for row in inputs.labels.to_dicts() if row.get("is_primary")}
    result = []
    for event in inputs.events.to_dicts():
        start, end, code = event.get("start"), event.get("end"), event.get("sigungu_code")
        if (
            event["event_id"] not in event_ids
            or not start
            or not end
            or end < start
            or end >= inputs.today
            or code not in regions
            or (code in BREAK_CODES and end > BREAK_DATE)
        ):
            continue
        region = regions[code].filter(pl.col("available_at") <= inputs.today)
        if "continuity_break" in region:
            region = region.filter(~pl.col("continuity_break").fill_null(True))
        as_of = start - timedelta(days=14)
        before = region.filter((pl.col("date") < as_of) & (pl.col("available_at") <= as_of))
        try:
            baseline = complete_window(before)
        except FileNotFoundError:
            continue
        during = complete_days(region.filter(pl.col("date").is_between(start, end)))
        if during["date"].n_unique() != (end - start).days + 1:
            continue

        # 행사일 요일 구성으로 평시를 재가중해 주말 행사와 평일 비중 차이를 줄인다.
        weekdays = baseline.with_columns(pl.col("date").dt.weekday().alias("weekday"))
        means = {
            (r["weekday"], r["tou_div"]): r["visitors"]
            for r in weekdays.group_by("weekday", "tou_div").agg(pl.col("visitors").mean()).to_dicts()
        }
        days = sorted(during["date"].unique().to_list())
        normal = {
            group: sum(means[d.isoweekday(), group] for d in days) / len(days)
            for group in ("현지인", "외지인", "외국인")
        }
        actual = {
            group: during.filter(pl.col("tou_div") == group)["visitors"].sum() / len(days) for group in normal
        }
        base_total, event_total = sum(normal.values()), sum(actual.values())
        if base_total <= 0 or event_total <= 0:
            continue
        result.append(
            {
                **event,
                "baseline": base_total,
                "during": event_total,
                "ratio": event_total / base_total,
                "baseline_share": normal["외지인"] / base_total,
                "event_share": actual["외지인"] / event_total,
                "baseline_from": baseline["date"].min().isoformat(),
                "baseline_to": baseline["date"].max().isoformat(),
                "as_of": as_of.isoformat(),
                "rowsRead": baseline.height + during.height,
                "available_at": max(baseline["available_at"].max(), during["available_at"].max()),
            }
        )
    return result
