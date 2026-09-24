"""전회차 실측 피처가 골드 라벨만 쓰고 실버 시군구 순증은 넣지 않는지 검사한다."""

from datetime import date

import pytest
from crowdcast.features.history_features import history_features


# 같은 축제의 2024년 회차 라벨 등급만 바꿔 2025년 회차의 전회차 피처를 만든다.
@pytest.mark.parametrize(("tier", "expected"), [("goldA", 12000.0), ("goldB", 12000.0), ("silver", None)])
def test_previous_actual_is_gold_only(tier: str, expected: float | None) -> None:
    base = {"name": "연천구석기축제", "sigungu_code": "41800", "type": "전통"}
    prior = {**base, "event_id": "e-2024", "start": date(2024, 5, 3), "end": date(2024, 5, 5)}
    current = {**base, "event_id": "e-2025", "start": date(2025, 5, 3), "end": date(2025, 5, 5)}
    label = {
        "event_id": "e-2024",
        "label_tier": tier,
        "daily_mean": 12000.0,
        "available_at": date(2024, 8, 1),
        "is_primary": True,
        "usable_for_training": True,
        "is_golden": False,
        "quality_flag": "ok",
    }
    result = history_features(current, date(2025, 4, 19), [prior, current], {"e-2024": label})
    assert result["previous_daily_mean"].value == expected
