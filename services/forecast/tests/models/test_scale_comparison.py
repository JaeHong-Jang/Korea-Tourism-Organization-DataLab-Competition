"""후보 비교에서 모집단이나 라벨을 바꾼 성적표가 통과하지 못하게 한다."""

from copy import deepcopy

import pytest
from crowdcast.models.scale_report import assert_same_population


# 같은 행사·정답이라도 학습 폴드가 다르면 비교를 거부한다.
def test_changed_training_fold_is_rejected() -> None:
    before = [{"year": 2025, "train_ids": ["e-yeoncheon-2023"]}]
    after = [{"year": 2025, "train_ids": ["e-yeoncheon-2024"]}]
    with pytest.raises(ValueError, match="롤링 폴드"):
        assert_same_population(before, after, [], [])


# 행사 누락·정답 변경·중복·공간 정의 변경을 모두 판정 전에 검사한다.
@pytest.mark.parametrize("change", ["missing", "actual", "duplicate", "scope"])
def test_changed_labels_are_rejected(change: str) -> None:
    before = [
        {
            "model": "simple",
            "year": 2025,
            "eventId": "e-yeoncheon-2025",
            "actual": 1200.0,
            "tier": "goldA",
            "spatial_scope": "행사장",
            "actual_level": 3,
        }
    ]
    after = deepcopy(before)
    if change == "missing":
        after.clear()
    elif change == "actual":
        after[0]["actual"] = 1500.0
    elif change == "scope":
        after[0]["spatial_scope"] = "시군구"
    else:
        after += deepcopy(before)
    with pytest.raises(ValueError, match="라벨|중복"):
        assert_same_population([], [], before, after)
    assert_same_population([], [], before, deepcopy(before))
