"""실제로 읽은 보유 자료만 데이터랩 활용 명세 계약으로 내보낸다."""

from collections import Counter
from typing import Any

from crowdcast.analytics.insights.evidence import datasets, source
from crowdcast.analytics.insights.records import GOLD, PLANS, VISITORS, Inputs, period


# 예보 전체의 인용 횟수를 세며 같은 근거가 다른 예보에서 쓰인 횟수도 포함한다.
def evidence_counts(inputs: Inputs) -> Counter[str]:
    return Counter(
        item["source"]["datasetId"]
        for forecast in inputs.forecasts
        for item in forecast.get("evidence", [])
        if item.get("source")
    )


# 기능 ID만 받는 usedIn 계약을 지키고 피처·라벨·인사이트 키는 용도 문장에 적는다.
def calculate(inputs: Inputs, cached: dict[str, dict[str, Any]]) -> dict[str, Any]:
    counts = evidence_counts(inputs)
    events = inputs.event_index()
    rows: dict[str, dict[str, Any]] = {}
    tables = [
        (
            VISITORS,
            inputs.region.to_dicts(),
            "region",
            "현지인·외지인·외국인 일 방문자",
            "명/일",
            "피처(region_daily_mean·nonlocal_share·weekend_ratio), 실버 라벨, 평시, I4·I5",
            ["M3-F1", "M7-F1"],
        ),
        (
            PLANS,
            inputs.plans.to_dicts(),
            "plans",
            "행사 일정·유형·전년 발표 방문객",
            "명",
            "행사 입력 피처, 라벨 매칭, I1·I2·I3·I6",
            ["M7-F1"],
        ),
    ]
    for tier, dataset in GOLD.items():
        labels = [
            {
                **row,
                "start": events.get(row["event_id"], {}).get("start"),
                "end": events.get(row["event_id"], {}).get("end"),
            }
            for row in inputs.labels.to_dicts()
            if row["label_tier"] == tier
        ]
        tables.append(
            (
                dataset,
                labels,
                "labels",
                "행사장 일평균 실측 방문객",
                "명/일",
                "골드 라벨, I1 비교 후보, I4·I5 행사 선정",
                ["M7-F1"],
            )
        )
    for dataset, records, input_name, metric, unit, purpose, used_in in tables:
        if not records:
            continue
        confirmed = cached.get(dataset, {}).get("confirmedAt", inputs.confirmed.get(input_name))
        if confirmed is None:
            raise ValueError(f"실제 읽은 자료의 확인일 없음: {dataset}")
        rows[dataset] = {
            "datasetId": dataset,
            "title": datasets()[dataset]["title"],
            "datalabMenu": source(dataset)["datalabMenu"],
            "metric": metric,
            "period": period(records, inputs.today),
            "unit": unit,
            "purpose": purpose + "; " + inputs.collection_notes.get(input_name, "실제 수집일 확인"),
            "usedIn": [*used_in, "M7-F2"],
            "rowsRead": len(records),
            "confirmedAt": confirmed,
            "evidenceCount": counts[dataset],
        }

    # 캐시가 없는 TourAPI·특일·기상청은 행을 만들지 않으며 달력 라이브러리를 API 사용으로 세지 않는다.
    for dataset, record in cached.items():
        if dataset in rows or not record["rowsRead"]:
            continue
        dates = record["dates"] or [record["confirmedAt"]]
        rows[dataset] = {
            "datasetId": dataset,
            "title": datasets()[dataset]["title"],
            "datalabMenu": source(dataset)["datalabMenu"],
            "metric": "보유 API 응답의 제공 기간(일); 행 수는 rowsRead",
            "period": {"from": min(dates), "to": max(dates)},
            "unit": "일",
            "purpose": "성공한 저장 응답의 활용 명세 확인; 피처·라벨 사용은 인용 증거 없이 단정하지 않음",
            "usedIn": ["M7-F2"],
            "rowsRead": record["rowsRead"],
            "confirmedAt": record["confirmedAt"],
            "evidenceCount": counts[dataset],
        }
    return {"generatedAt": inputs.computed_at, "rows": [rows[key] for key in sorted(rows)]}
