"""대표·학습 가능·정의 일치 골드의 G0 표본 수와 순간 최대 환산 층을 집계한다."""

from typing import Any

import numpy as np
import polars as pl
from crowdcast.labels.schema import DECIMALS
from crowdcast.rules.peak import sample_peak

# 선택 평가인 2023년은 표에 남기되 필수 평가 연도 조건을 바꾸지 않는다.
EVALUATION_YEARS = (2024, 2025)
PEAK_SEED = 2026
PEAK_SAMPLES = 4000
GOLD_COLUMNS = ("gold_event_count", "peak_below_1000_count", "peak_ge_1000_count", "peak_missing_count")


# 지정영역 확인이 없는 골드B나 비대표 골드A가 표본 수를 부풀리지 않게 한다.
def eligible_gold(labels: pl.DataFrame) -> pl.DataFrame:
    return (
        labels.filter(
            pl.col("label_tier").is_in(["goldA", "goldB"])
            & pl.col("is_primary")
            & pl.col("usable_for_training")
            & ~pl.col("is_golden")
            & (pl.col("definition") == "일평균")
            & (pl.col("time_unit") == "일")
            & (pl.col("spatial_scope") == "행사장")
            & (pl.col("kind") == "사후 집계")
        )
        .unique(subset="event_id")
        .sort("event_id")
    )


# 실측 일평균을 고정한 T-202 환산 표본의 중앙값으로 순간 최대 1,000명 층을 나눈다.
def peak_record(label: dict[str, Any], event: dict[str, Any]) -> dict[str, Any]:
    record = {
        "event_id": label["event_id"],
        "year": label["year"],
        "peak_estimate": None,
        "peak_band": "missing",
        "reason": "일정 미확정",
        "assumption_ids": [],
    }
    if not event["start"] or not event["end"] or event["end"] < event["start"]:
        return record
    contract_event = {
        "id": event["event_id"],
        "type": event.get("type") or "기타",
        "startsAt": f"{event['start'].isoformat()}T00:00:00+09:00",
        "endsAt": f"{event['end'].isoformat()}T23:59:59+09:00",
    }
    result = sample_peak([label["daily_mean"]] * 3, contract_event, n=PEAK_SAMPLES, seed=PEAK_SEED)
    peak = float(np.median(result.samples))
    record.update(
        peak_estimate=round(peak, DECIMALS),
        peak_band="below_1000" if peak < 1000 else "ge_1000",
        reason=None,
        assumption_ids=result.assumption_ids,
    )
    return record


# 전체와 연도별 표에 같은 열 이름·모집단을 사용한다.
def counts(records: list[dict[str, Any]]) -> dict[str, int]:
    return {
        "gold_event_count": len(records),
        "peak_below_1000_count": sum(row["peak_band"] == "below_1000" for row in records),
        "peak_ge_1000_count": sum(row["peak_band"] == "ge_1000" for row in records),
        "peak_missing_count": sum(row["peak_band"] == "missing" for row in records),
    }


# 표본 수·평가 연도·환산 경계 양쪽이라는 세 조건을 평가 전에 함께 고정한다.
def build_g0(labels: pl.DataFrame, events: list[dict[str, Any]]) -> dict[str, Any]:
    index = {event["event_id"]: event for event in events}
    records = [peak_record(row, index[row["event_id"]]) for row in eligible_gold(labels).to_dicts()]
    years = sorted(set(labels["year"].to_list()) | set(EVALUATION_YEARS))
    by_year = [
        {
            "year": year,
            "is_evaluation_year": year in EVALUATION_YEARS,
            **counts([row for row in records if row["year"] == year]),
        }
        for year in years
    ]
    summary = counts(records)
    conditions = {
        "gold_ge_60": summary["gold_event_count"] >= 60,
        "evaluation_years_ge_15": all(
            row["gold_event_count"] >= 15 for row in by_year if row["is_evaluation_year"]
        ),
        "peak_sides_ge_10": min(summary["peak_below_1000_count"], summary["peak_ge_1000_count"]) >= 10,
    }
    decision = (
        "simple"
        if summary["gold_event_count"] < 30
        else ("planned" if all(conditions.values()) else "partial")
    )
    return {
        "gold_summary": summary,
        "gold_by_year": by_year,
        "gold_events": records,
        "conditions": conditions,
        "decision": decision,
        "peak_conversion": {
            "method": "T-202 sample_peak([daily_mean]*3) 표본 중앙값",
            "estimated": True,
            "time_unit": "순간",
            "threshold": 1000,
            "upper_inclusive": True,
            "seed": PEAK_SEED,
            "n": PEAK_SAMPLES,
        },
    }


# 부족한 표본으로 계획대로 진행한다고 말하지 않고 세 갈래의 결정 이유를 남긴다.
def g0_judgment(g0: dict[str, Any]) -> str:
    count = g0["gold_summary"]["gold_event_count"]
    if g0["decision"] == "simple":
        return (
            f"G0: 골드 {count}건 < 30 — 유형×규모 계층 중앙값 + 전회차 모델로 단순화; "
            "확률 확정 대신 구간 + 규칙 판정; 서식4에 표본 한계 명시."
        )
    if g0["decision"] == "planned":
        return f"G0: 계획대로 — 골드 {count}건 ≥ 60, 평가 연도마다 ≥ 15, 환산 기준선 양쪽 각 ≥ 10 충족."
    return (
        f"G0: 일부 충족 — 골드 {count}건; 실버를 보조 정답으로 더하고 B0·B1과 병기. "
        "한쪽 표본 부족 시 확률을 구간으로 표시; 세 조건의 통과 여부는 conditions 표 참조."
    )


# 기계용 JSON과 같은 필드명을 Markdown 표에 노출해 T-203의 해석 차이를 막는다.
def g0_lines(g0: dict[str, Any]) -> list[str]:
    summary = g0["gold_summary"]
    lines = [
        "",
        "## 정의 일치와 G0",
        "",
        f"정의 일치 골드 고유 행사 수(골든 제외): {summary['gold_event_count']}건.",
        "행사=연도별 event_id. goldA/B 중 is_primary & usable_for_training & !is_golden, "
        "일평균·일·행사장·사후 집계만 집계. 골드B는 diy_area_matches_venue=예만 행사장으로 인정한다.",
        "평가 연도는 2024·2025(2023은 선택 평가). 순간 최대는 T-202 sample_peak에 실측 일평균을 "
        f"고정해 n={PEAK_SAMPLES}, seed={PEAK_SEED}로 환산한 중앙값(추정). "
        "아래는 <1,000, 위는 ≥1,000이며 일평균 1,000명과 비교하지 않는다.",
        g0_judgment(g0),
        "",
        "| scope | " + " | ".join(GOLD_COLUMNS) + " |",
        "|---|---:|---:|---:|---:|",
        "| total | " + " | ".join(str(summary[key]) for key in GOLD_COLUMNS) + " |",
        "",
        "| year | is_evaluation_year | " + " | ".join(GOLD_COLUMNS) + " |",
        "|---:|---|---:|---:|---:|---:|",
    ]
    lines += [
        f"| {row['year']} | {str(row['is_evaluation_year']).lower()} | "
        + " | ".join(str(row[key]) for key in GOLD_COLUMNS)
        + " |"
        for row in g0["gold_by_year"]
    ]
    lines += ["", "| conditions | passed |", "|---|---|"]
    lines += [f"| {key} | {str(value).lower()} |" for key, value in g0["conditions"].items()]
    return lines
