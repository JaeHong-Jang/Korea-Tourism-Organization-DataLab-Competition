"""피처 관측과 요인 기여를 출처 근거 및 모델 근거에 연결한다."""

from typing import Any

from crowdcast.api.assemble.evidence import SOURCES, fragment, source


# 관측 내용을 근거 요약에 보존해 요인에서 해당 관측까지 추적하게 한다.
def observation_evidence(observed: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, str]]:
    fragments, by_feature = [], {}
    kinds = {item["datasetId"]: key for key, item in SOURCES.items()}
    for observation in observed:
        evidence = fragment(
            "data",
            f"예측 입력 관측: {observation['featureName']}",
            observation,
            source=source(kinds[observation["datasetId"]]),
            period={"from": observation["observedAt"], "to": observation["observedAt"]},
            availableAt=observation["availableAt"],
        )
        fragments.append(evidence)
        by_feature[observation["featureName"]] = evidence["id"]
    return fragments, by_feature


# 분포·요인·학습 범위와 표시 방식의 한계를 하나의 모델 근거에 묶는다.
def model_evidence(
    forecast: dict[str, Any],
    card: dict[str, Any],
    primary: str,
    factors: list[dict[str, Any]],
) -> dict[str, Any]:
    return fragment(
        "model",
        "방문객 분포와 예측 요인",
        {
            "modelRunId": card["id"],
            "modelVersion": card["modelVersion"],
            "trainRange": card["trainRange"],
            "primaryModel": primary,
            "dailyMean": forecast["dailyMean"],
            "peakConcurrent": forecast["peakConcurrent"],
            "probabilities": forecast["probabilities"],
            "factors": factors,
            "notes": card["notes"],
        },
        forecastId=forecast["id"],
        modelVersion=card["modelVersion"],
        period=card["trainRange"],
        quantityIds=[forecast[key]["id"] for key in ("dailyMean", "peakConcurrent")],
    )
