"""지표 수치와 입력 행 수를 정본 DataEvidence·AssumptionEvidence로 묶는다."""

import json
from functools import lru_cache
from typing import Any

from crowdcast import paths
from crowdcast.analytics.insights.records import Inputs, period
from crowdcast.api.assemble.evidence import fragment


# 데이터셋 이름·URL은 계약 마스터에서만 읽는다.
@lru_cache(maxsize=1)
def datasets() -> dict[str, Any]:
    return json.loads((paths.REPO_ROOT / "packages/contracts/jsonld/master-labels.json").read_bytes())[
        "datasets"
    ]


# API 자료를 로그인 데이터랩 메뉴에서 다운로드한 것으로 표시하지 않는다.
def source(dataset: str) -> dict[str, Any]:
    item = datasets()[dataset]
    menu = {
        "ds-datalab-festival-status": "테마 > 문화관광축제 현황",
        "ds-datalab-diy": "행사/축제 DIY 맞춤 분석",
    }.get(dataset)
    publisher = (
        "문화체육관광부"
        if "mcst" in dataset
        else "기상청"
        if "kma" in dataset
        else "한국천문연구원"
        if "kasi" in dataset
        else "한국관광공사"
    )
    return {
        "datasetId": dataset,
        "title": item["title"],
        "accessUrl": item["url"],
        "publisher": publisher,
        "datalabMenu": menu,
    }


# 산식·정확한 사용 행 수·가용 시점과 그 한계를 근거의 구조화 요약에 보존한다.
def data_evidence(
    inputs: Inputs,
    dataset: str,
    rows: list[dict[str, Any]],
    content: dict[str, Any],
    *,
    input_name: str,
    used_period: dict[str, str] | None = None,
) -> dict[str, Any]:
    available = max(
        (str(row["available_at"])[:10] for row in rows if row.get("available_at")),
        default=inputs.confirmed.get(input_name, inputs.today.isoformat()),
    )
    return fragment(
        "data",
        datasets()[dataset]["title"],
        {
            "datasetId": dataset,
            "rowsRead": len(rows),
            **content,
            "dateNote": inputs.collection_notes.get(input_name, "입력에 공개일이 없으면 계산일 기준 확인"),
        },
        period=used_period or period(rows, inputs.today),
        source=source(dataset),
        availableAt=available,
    )


# 일괄 예보 집계에는 실제 예보가 인용한 데이터셋과 원 근거 ID를 함께 연결한다.
def forecast_evidence(inputs: Inputs) -> list[dict[str, Any]]:
    references: dict[str, list[dict[str, Any]]] = {}
    for forecast in inputs.forecasts:
        for item in forecast.get("evidence", []):
            if item.get("kind") == "data" and item.get("source"):
                references.setdefault(item["source"]["datasetId"], []).append(item)
    result = []
    for dataset, items in sorted(references.items()):
        result.append(
            fragment(
                "data",
                "일괄 예보의 입력 자료: " + datasets()[dataset]["title"],
                {
                    "rowsRead": len(items),
                    "rowDefinition": "저장 예보에서 읽은 데이터 근거 행(중복 인용 포함)",
                    "inputEvidenceIds": sorted({item["id"] for item in items}),
                    "forecastIds": [row["id"] for row in inputs.forecasts],
                    "modelVersions": sorted(
                        {row["modelVersion"] for row in inputs.forecasts if row.get("modelVersion")}
                    ),
                },
                source=source(dataset),
                availableAt=max(item["availableAt"] for item in items),
                period={
                    "from": min(item["period"]["from"] for item in items),
                    "to": max(item["period"]["to"] for item in items),
                },
            )
        )
    return result


# 계약에 없는 보조 수치는 근거에 넣고 화면의 요약 필드는 계약 그대로 구성한다.
def insight(
    inputs: Inputs,
    key: str,
    title: str,
    value: float,
    unit: str,
    text: str,
    rows: list[dict[str, Any]],
    series: list[dict[str, Any]],
    evidence: list[dict[str, Any]],
    *,
    pairs: int | None = None,
    used_period: dict[str, str] | None = None,
) -> dict[str, Any]:
    if not rows:
        text = "표본 없음 — " + text + " (요약값 0은 결측 표시; 기간은 입력 범위 또는 계산일)"
    unique = {item["id"]: item for item in evidence}
    return {
        "key": key,
        "title": title,
        "headline": {"value": value, "unit": unit, "text": text},
        "sampleSize": len(rows),
        "comparablePairs": pairs,
        "period": used_period or period(rows or inputs.events.to_dicts(), inputs.today),
        "series": series,
        "evidenceIds": list(unique),
        "evidence": list(unique.values()),
        "computedAt": inputs.computed_at,
    }
