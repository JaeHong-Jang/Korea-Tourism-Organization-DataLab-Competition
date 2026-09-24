"""사전 공개가 확인된 행사 속성을 고정 범주와 결측 허용 수치로 바꾼다."""

import math
from typing import Any

from crowdcast.features.availability import Feature, published

# 계약 범주 순서를 고정해 평가 자료로 인코딩 사전을 학습하지 않는다.
CATEGORIES = {
    "type": ["불꽃", "공연", "대학", "먹거리", "꽃", "전통", "기타"],
    "time_of_day": ["주간", "야간", "종일", "미상"],
    "fee": ["무료", "유료", "미상"],
    "host_type": ["지자체", "민간", "대학", "기타"],
}
HAZARDS = {
    "폭죽": "fireworks",
    "불": "fire",
    "가연성가스": "flammable_gas",
    "석유류": "petroleum",
    "산": "mountain",
    "수면": "water",
    "차량진입": "vehicle_entry",
    "단일출입구": "single_exit",
    "무대밀집": "stage_crowd",
    "야간조명부족": "poor_lighting",
}


# 필드별 공개일을 우선하며 행사 전체 공개일만 있는 입력도 지원한다.
def event_features(event: dict[str, Any]) -> dict[str, Feature]:
    dates = event.get("feature_available_at") or {}
    result = {}
    for key, categories in CATEGORIES.items():
        value = event.get(key)
        encoded = float(categories.index(value)) if value in categories else None
        result[key] = published(encoded, dates.get(key, event.get("available_at")))
    for key in ("edition", "budget_krw"):
        value = event.get(key)
        if value is not None and (not math.isfinite(value) or value < 0):
            raise ValueError(f"행사 수치 오류: {key}")
        name = "log_budget" if key == "budget_krw" else key
        result[name] = published(
            math.log1p(value) if key == "budget_krw" and value is not None else value,
            dates.get(key, event.get("available_at")),
        )
    for hazard, name in HAZARDS.items():
        value = float(hazard in event["hazard_flags"]) if event.get("hazard_flags") is not None else None
        result[f"hazard_{name}"] = published(value, dates.get("hazard_flags", event.get("available_at")))
    return result
