"""유형별 일평균 예보 규모 중앙값에 설정의 동시체류율을 곱한다."""

from collections import defaultdict
from statistics import median
from typing import Any

from crowdcast.analytics.insights.evidence import data_evidence, forecast_evidence, insight
from crowdcast.analytics.insights.i2 import rule_event
from crowdcast.analytics.insights.records import PLANS, Inputs, number
from crowdcast.rules.evidence import assumption_evidence
from crowdcast.rules.peak import _assumptions


# 면적당 실측 밀도가 아니라 체류 가정으로 환산한 동시 인원임을 명시한다.
def calculate(inputs: Inputs) -> dict[str, Any]:
    events = inputs.event_index()
    groups: dict[str, list[float]] = defaultdict(list)
    assumptions, rows = {}, []
    for forecast in inputs.forecasts:
        row = events[forecast["eventId"]]
        daily = number(forecast["dailyMean"]["p50"])
        if daily is None:
            continue
        groups[row["type"]].append(daily)
        assumptions[row["type"]] = _assumptions(rule_event(row))[1]
        rows.append(row)
    series, details, evidence = [], [], []
    for kind in sorted(groups):
        assumption = assumptions[kind]
        scale = median(groups[kind])
        value = scale * assumption["value"]
        series.append({"label": f"{kind} · 동시 인원 추정(명)", "value": value})
        details.append(
            {
                "type": kind,
                "sampleSize": len(groups[kind]),
                "dailyMedian": scale,
                "concurrencyRate": assumption["value"],
                "estimatedConcurrent": value,
            }
        )
        evidence.append(assumption_evidence(assumption, inputs=details[-1]))
    evidence.insert(
        0,
        data_evidence(
            inputs,
            PLANS,
            rows,
            {
                "byType": details,
                "formula": "유형별 일평균 예보 p50 중앙값 × 동시체류율",
                "note": "추정 산식 기반; 면적당 밀도·실측·피크일 환산이 아님",
                "forecastIds": [row["id"] for row in inputs.forecasts],
            },
            input_name="events",
        ),
    )
    evidence.extend(forecast_evidence(inputs))
    value = max((row["value"] for row in series), default=0)
    return insight(
        inputs,
        "I3",
        "유형별 순간 밀집도",
        value,
        "명",
        "유형별 규모 중앙값 × 동시체류율 중 최대값; 추정 산식 기반, 면적당 실측 밀도 아님",
        rows,
        series,
        evidence,
    )
