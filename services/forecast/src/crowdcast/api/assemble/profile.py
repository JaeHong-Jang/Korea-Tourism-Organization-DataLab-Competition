"""공개된 지역 구성비를 연결하고 근거 없는 시간대 곡선은 비워 둔다."""

from datetime import date
from typing import Any

import polars as pl
from crowdcast.analytics.baseline import complete_days
from crowdcast.api.assemble.evidence import fragment, source
from crowdcast.api.assemble.inputs import region_rows


# 평시와 같은 창의 세 집단 비중만 사용하고 행사장 구성으로 단정하지 않는다.
def composition(
    code: str, as_of: date, period: dict[str, str]
) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    frame = (
        complete_days(region_rows(code, as_of))
        .filter(
            pl.col("date").is_between(date.fromisoformat(period["from"]), date.fromisoformat(period["to"]))
        )
        .sort("date", "tou_div")
    )
    total = frame["visitors"].sum()
    if frame.is_empty() or not total:
        return None, []
    shares = {
        key: float(frame.filter(pl.col("tou_div") == group)["visitors"].sum() / total)
        for key, group in (("local", "현지인"), ("nonlocal", "외지인"), ("foreign", "외국인"))
    }
    evidence = fragment(
        "data",
        "개최지 평시 방문객 구성비",
        {"sigunguCode": code, **shares, "unit": "비율", "note": "지역 방문자 구성 — 행사장 구성 실측이 아님"},
        period=period,
        source=source("silver"),
        availableAt=frame["available_at"].max().isoformat(),
    )
    return {**shares, "evidenceId": evidence["id"]}, [evidence]
