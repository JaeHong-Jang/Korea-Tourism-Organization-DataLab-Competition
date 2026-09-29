"""일평균 예보를 1만·2만 명 고정 경계의 규모 등급으로 분류한다."""

from typing import Any


# 예측 중앙값에 고정 경계를 적용하고 빈 등급도 유지한다.
def daily_scale(people: list[dict[str, Any]] | None) -> dict[str, Any] | None:
    if people is None:
        return None
    bands = [
        {"grade": 1, "lowerInclusive": 0, "upperExclusive": 10000, "count": 0},
        {"grade": 2, "lowerInclusive": 10000, "upperExclusive": 20000, "count": 0},
        {"grade": 3, "lowerInclusive": 20000, "upperExclusive": None, "count": 0},
    ]
    for row in people:
        grade = 1 + sum(row["dailyMean"]["p50"] >= boundary for boundary in (10000, 20000))
        row["dailyScaleGrade"] = grade
        bands[grade - 1]["count"] += 1
    return {
        "method": "fixed",
        "basis": "dailyMean.p50",
        "unit": "명/일",
        "sampleSize": len(people),
        "classCount": 3,
        "bands": bands,
        "note": "방문 규모를 읽기 쉽게 비교하기 위한 1만·2만 명 고정 표시 구간. 안전·위험 판정 기준은 아님.",
        "estimated": True,
    }
