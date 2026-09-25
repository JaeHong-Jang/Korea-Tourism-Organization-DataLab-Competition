"""같은 라벨 행사들의 행사일·평시 외지인 비율을 비교하고 유입 권역 부재를 공개한다."""

from statistics import mean
from typing import Any

from crowdcast.analytics.insights.evidence import data_evidence, insight
from crowdcast.analytics.insights.records import VISITORS, Inputs


# 현지인·외지인·외국인 합을 분모로 쓰고 행사별 비율의 단순 평균을 비교한다.
def calculate(inputs: Inputs, pairs: list[dict[str, Any]]) -> dict[str, Any]:
    actual = mean(row["event_share"] for row in pairs) if pairs else 0
    normal = mean(row["baseline_share"] for row in pairs) if pairs else 0
    note = "유입 권역은 자료 없음(H7); 시군구 구성비이며 행사장 방문객의 출신 지역이 아님"
    content = {
        "rowsRead": inputs.region.height,
        "formula": "외지인 / (현지인 + 외지인 + 외국인), 행사별 비율 단순 평균",
        "eventShare": actual if pairs else None,
        "baselineShare": normal if pairs else None,
        "differencePp": (actual - normal) * 100 if pairs else None,
        "observationUsesIncludingRepeatedBaselines": sum(row["rowsRead"] for row in pairs),
        "note": note,
        "eventIds": [row["event_id"] for row in pairs],
    }
    evidence = [data_evidence(inputs, VISITORS, pairs, content, input_name="region")]
    series = [
        {"label": "행사일 외지인 비율", "value": actual},
        {"label": "평시 외지인 비율", "value": normal},
    ]
    return insight(
        inputs, "I5", "외지인 비중", actual, "비율", note, pairs, series, evidence, pairs=len(pairs)
    )
