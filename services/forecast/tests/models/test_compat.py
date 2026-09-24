"""실제 모델보다 먼저 LightGBM 버전·분위수·직렬화 호환성을 확인한다."""

from pathlib import Path

import pytest
from crowdcast.models.compat import check_compatibility, quantile_regressor


# 세 분위수 모두 학습·저장·복원할 수 있어야 한다.
def test_quantile_roundtrip(tmp_path: Path) -> None:
    check_compatibility(tmp_path)


# 단조 제약은 값이 영벡터여도 LightGBM 호출 전에 거부한다.
@pytest.mark.parametrize("key", ["monotone_constraints", "monotone_constraint", "mc"])
def test_monotone_guard(key: str) -> None:
    with pytest.raises(ValueError, match="monotone_constraints"):
        quantile_regressor(0.5, **{key: [0, 0, 0]})


# 기본값과 LightGBM 별칭을 통해서도 얕은 모델 제약을 우회하지 못한다.
def test_shallow_tree_guard() -> None:
    assert quantile_regressor(0.5).get_params()["num_leaves"] == 15
    assert quantile_regressor(0.5).get_params()["min_child_samples"] == 10
    for params in ({"num_leaves": 16}, {"min_data_in_leaf": 9}, {"min_data": 9}, {"max_leaves": 16}):
        with pytest.raises(ValueError, match="num_leaves"):
            quantile_regressor(0.5, **params)
