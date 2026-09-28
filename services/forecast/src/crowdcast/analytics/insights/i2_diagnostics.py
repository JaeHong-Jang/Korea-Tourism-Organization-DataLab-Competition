"""저장 예보의 숫자 반복과 실제 적용 규칙을 집계하며 모델·판정은 바꾸지 않는다."""

from collections import defaultdict
from math import isfinite
from typing import Any


# 식별자 대신 인원 분위수만 비교해 같은 예측값의 반복을 찾는다.
def prediction_patterns(
    forecasts: list[dict[str, Any]], events: dict[str, dict[str, Any]]
) -> dict[str, Any] | None:
    if not forecasts:
        return None
    groups: dict[str, list[tuple[float, ...]]] = defaultdict(list)
    peaks = []
    for forecast in forecasts:
        values = []
        for field in ("dailyMean", "peakConcurrent"):
            quantity = forecast.get(field, {})
            pattern = tuple(quantity.get(key) for key in ("p10", "p50", "p90"))
            if any(type(value) not in (int, float) or not isfinite(value) or value < 0 for value in pattern):
                return None
            if not pattern[0] <= pattern[1] <= pattern[2]:
                return None
            values.append(pattern)
        kind = events[forecast["eventId"]].get("type") or "유형 미확인"
        groups[kind].append(values[0])
        peaks.append(values[1])
    return {
        "sampleSize": len(forecasts),
        "dailyPatternCount": len({pattern for rows in groups.values() for pattern in rows}),
        "peakPatternCount": len(set(peaks)),
        "largeRuleCount": sum(
            "rule-internal-5000" in row["judgment"].get("ruleIds", []) for row in forecasts
        ),
        "outsideTrainingCount": sum(row.get("ood") is True for row in forecasts),
        "types": [
            {"type": kind, "count": len(rows), "patterns": len(set(rows))}
            for kind, rows in sorted(groups.items())
        ],
        "note": "유형별 예측값 반복 집계이며 사고 확률이나 실제 오차를 뜻하지 않음",
    }
