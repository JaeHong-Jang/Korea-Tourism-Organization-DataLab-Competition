"""명시적으로 켠 경우에만 동일 단위의 두 모델 구간 겹침을 미발행 ModelEvidence로 만든다."""

import math
from datetime import date
from pathlib import Path
from typing import Any

from crowdcast.api.assemble.evidence import fragment
from crowdcast.api.assemble.inputs import cutoff
from crowdcast.api.assemble.observations import feature_frame
from crowdcast.models.card import validate_contract
from crowdcast.models.challenger.config import ChallengerConfig
from crowdcast.models.challenger.encoding import check_features
from crowdcast.models.challenger.posterior import Posterior


# 길이가 없는 같은 점 구간은 완전 일치, 떨어진 점·접하는 구간은 겹침 없음으로 정의한다.
def overlap_ratio(first: tuple[float, float], second: tuple[float, float]) -> float:
    for low, high in (first, second):
        if not math.isfinite(low) or not math.isfinite(high) or low < 0 or low > high:
            raise ValueError("합의 구간은 유한한 비음수이며 하한 ≤ 상한이어야 합니다")
    intersection = max(0.0, min(first[1], second[1]) - max(first[0], second[0]))
    union = first[1] - first[0] + second[1] - second[0] - intersection
    return intersection / union if union else float(first == second)


# 예보에 연결하거나 발행하지 않으며 반환 조각은 별도의 근거 그래프·SHACL 검증 대상이다.
def agreement_evidence(
    event: dict[str, Any],
    forecast: dict[str, Any],
    directory: Path,
    config: ChallengerConfig | None = None,
) -> dict[str, Any] | None:
    config = config or ChallengerConfig()
    if not config.agreement_enabled:
        return None
    validate_contract("event", event)
    posterior = Posterior.load(directory)
    if event["id"] != forecast["eventId"]:
        raise ValueError("합의 근거의 행사와 예보가 다릅니다")
    if posterior.metadata["base_model_version"] != forecast["modelVersion"]:
        raise ValueError("도전 모델과 사용 모델 버전이 다릅니다")
    daily = forecast["dailyMean"]
    if (daily["unit"], daily["timeUnit"], daily["spatialScope"]) != ("명/일", "일", "행사장"):
        raise ValueError("합의 근거는 동일한 행사장 일평균 단위만 비교합니다")
    as_of = date.fromisoformat(forecast["asOf"])
    if as_of > cutoff(event) or as_of < date.fromisoformat(posterior.metadata["labels_available_at"]):
        raise ValueError("합의 근거의 학습 라벨 또는 피처 공개 시점이 예보 기준일 뒤입니다")

    # 운영과 같은 피처 생성기의 공개일 게이트를 통과한 행사만 별도 사후분포로 예측한다.
    names = ["type", *posterior.encoding["features"]]
    frame = feature_frame(event, as_of, names)
    check_features(frame, names)
    values = posterior.predict(frame, {event["id"]: {"sido": event["sido"]}})[0].tolist()
    overlap = overlap_ratio((daily["p10"], daily["p90"]), (values[0], values[2]))
    result = fragment(
        "model",
        f"두 모델 합의 {overlap * 100:.1f}%",
        {
            "estimated": True,
            "overlapRatio": overlap,
            "overlapDefinition": "intersection / union (IoU)",
            "unit": "명/일",
            "timeUnit": "일",
            "spatialScope": "행사장",
            "intervalLevel": 0.8,
            "primaryModelVersion": forecast["modelVersion"],
            "challengerModelVersion": forecast["modelVersion"] + "-challenger",
            "primaryInterval": [daily["p10"], daily["p90"]],
            "challengerQuantiles": values,
            "inference": posterior.metadata["config"],
            "note": "추정 구간의 겹침이며 정확도·발생 확률이 아님. 참고용 — 담당자 검토 필수",
        },
        forecastId=forecast["id"],
        modelVersion=forecast["modelVersion"] + "-challenger",
        quantityIds=[daily["id"]],
    )
    validate_contract("evidence", result)
    return result
