"""예보 요청의 행사 속성을 관측과 구분해 고정 범주와 결측 허용 수치로 바꾼다."""

import math
from typing import Any

from crowdcast.features.availability import Feature

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


# 행사 자체 속성은 예보 입력이므로 관측 공개일 유무와 관계없이 보존한다.
def event_features(event: dict[str, Any]) -> dict[str, Feature]:
    result = {}
    for key, categories in CATEGORIES.items():
        value = event.get(key)
        encoded = float(categories.index(value)) if value in categories else None
        result[key] = Feature(encoded, None, is_observation=False)
    for key in ("edition", "budget_krw"):
        value = event.get(key)
        if value is not None and (not math.isfinite(value) or value < 0):
            raise ValueError(f"행사 수치 오류: {key}")
        name = "log_budget" if key == "budget_krw" else key
        result[name] = Feature(
            math.log1p(value) if key == "budget_krw" and value is not None else value,
            None,
            is_observation=False,
        )
    for hazard, name in HAZARDS.items():
        value = float(hazard in event["hazard_flags"]) if event.get("hazard_flags") is not None else None
        result[f"hazard_{name}"] = Feature(value, None, is_observation=False)
    return result
