"""분포 밖 입력 판정이 학습 범위가 있는 피처만 검사하는지 확인한다."""

from copy import deepcopy

import pytest
from crowdcast.features.event_features import CATEGORIES, event_features
from crowdcast.models.ood import detect_ood


# 학습에서 전부 결측이던 피처(예: 시간대)는 값이 있어도 OOD 사유가 아니다 — 범위가 있는 피처만 검사한다.
def test_unlearned_feature_is_not_out_of_range() -> None:
    fitted = {"counts": {"5:>5000": 9}, "ranges": {"time_of_day": [None, None], "month": [4.0, 10.0]}}
    row = {"type": 5.0, "time_of_day": 2.0, "month": 5.0}
    assert detect_ood(row, 12000.0, fitted)["outside_features"] == []
    assert detect_ood({**row, "month": 12.0}, 12000.0, fitted)["outside_features"] == ["month"]


# 미상만 배운 요금·시간대는 제외하지만 실제로 없던 불꽃과 표본 부족은 계속 OOD다.
@pytest.mark.parametrize("fee", ["무료", "유료", "미상"])
@pytest.mark.parametrize("fireworks", [False, True])
@pytest.mark.parametrize("count", [4, 5])
def test_unknown_only_categories_are_missing(fee: str, fireworks: bool, count: int) -> None:
    fitted = {
        "counts": {"5:>5000": count},
        "ranges": {name: [float(values.index("미상"))] * 2
                   for name, values in CATEGORIES.items() if "미상" in values},
    }
    fitted["ranges"]["hazard_fireworks"] = [0.0, 0.0]
    before = deepcopy(fitted)
    features = event_features({
        "type": "전통", "fee": fee, "time_of_day": "주간",
        "hazard_flags": ["폭죽"] if fireworks else [],
    })
    result = detect_ood({name: feature.value for name, feature in features.items()}, 12000.0, fitted)
    assert result["outside_features"] == (["hazard_fireworks"] if fireworks else [])
    assert result["ood"] is (fireworks or count < 5)
    assert result["training_n"] == count
    assert fitted == before


# 미상 외의 요금도 학습했다면 기존 최솟값·최댓값 검사를 그대로 유지한다.
@pytest.mark.parametrize("bounds,value,outside", [
    ([0.0, 0.0], 1.0, True), ([1.0, 2.0], 0.0, True), ([0.0, 2.0], 1.0, False),
])
def test_learned_fee_keeps_range_check(bounds: list[float], value: float, outside: bool) -> None:
    fitted = {"counts": {"5:>5000": 5}, "ranges": {"fee": bounds}}
    result = detect_ood({"type": 5.0, "fee": value}, 12000.0, fitted)
    assert result["outside_features"] == (["fee"] if outside else [])
    assert result["ood"] is outside
