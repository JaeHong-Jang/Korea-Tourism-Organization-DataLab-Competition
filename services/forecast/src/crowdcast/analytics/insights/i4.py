"""시군구 평시 방문 규모 삼분위별 행사일 방문 배수를 계산한다."""

from statistics import median
from typing import Any

import numpy as np
from crowdcast.analytics.insights.evidence import data_evidence, insight
from crowdcast.analytics.insights.records import VISITORS, Inputs


# 인구 자료가 없으므로 시군구별 평시 방문 중앙값의 삼분위로 규모를 구분한다.
def calculate(inputs: Inputs, pairs: list[dict[str, Any]]) -> dict[str, Any]:
    codes = sorted({row["sigungu_code"] for row in pairs})
    sizes = {code: median(row["baseline"] for row in pairs if row["sigungu_code"] == code) for code in codes}
    cuts = np.quantile(list(sizes.values()), [1 / 3, 2 / 3]).tolist() if sizes else [0, 0]
    groups: dict[str, list[float]] = {"소규모": [], "중규모": [], "대규모": []}
    for row in pairs:
        size = sizes[row["sigungu_code"]]
        group = "소규모" if size <= cuts[0] else "중규모" if size <= cuts[1] else "대규모"
        groups[group].append(row["ratio"])
    series = [
        {"label": f"{name} 시군구 · {len(values)}건", "value": median(values)}
        for name, values in groups.items()
        if values
    ]
    content = {
        "rowsRead": inputs.region.height,
        "formula": "행사일 시군구 방문 일평균 / 행사 요일로 가중한 평시 방문 일평균",
        "baseline": "D-14까지 공개된 직전 완전한 28일; T-203 요일별 평균",
        "regionSize": "시군구별 평시 방문 중앙값의 삼분위(인구 규모 아님)",
        "cuts": cuts,
        "observationUsesIncludingRepeatedBaselines": sum(row["rowsRead"] for row in pairs),
        "pairs": [
            {
                key: row[key]
                for key in (
                    "event_id",
                    "baseline",
                    "during",
                    "ratio",
                    "baseline_from",
                    "baseline_to",
                    "as_of",
                )
            }
            for row in pairs
        ],
    }
    evidence = [data_evidence(inputs, VISITORS, pairs, content, input_name="region")]
    value = median(row["ratio"] for row in pairs) if pairs else 0
    return insight(
        inputs,
        "I4",
        "평시 대비 순증 배수",
        value,
        "배",
        "행사일/평시 방문 배수 중앙값; 시군구 평시 방문 규모별 비교, 행사만의 인과 효과 아님",
        pairs,
        series,
        evidence,
        pairs=len(pairs),
    )
