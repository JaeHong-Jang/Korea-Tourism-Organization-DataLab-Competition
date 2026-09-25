"""후보 비교에서 모집단이나 라벨을 바꾼 성적표가 통과하지 못하게 한다."""

from copy import deepcopy

import pytest
from crowdcast.models.scale_gate import promotion_review
from crowdcast.models.scale_report import assert_same_population, comparison_metrics


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


# 포함률과 점오차가 같아도 두 평가 정의 중 하나에서 실제 대상 이상을 놓치면 보류한다.
@pytest.mark.parametrize("definition", ["conditional", "filename_sensitivity"])
@pytest.mark.parametrize("automatic", [True, None])
def test_recall_drop_blocks_proposal(definition: str, automatic: bool | None) -> None:
    points = [
        {
            "model": "simple",
            "actual": 1200,
            "p10": 800,
            "p50": 1200,
            "p90": 2000,
            "actual_level": 3,
            "level": 3,
            "scale_source": "announced",
        },
        {
            "model": "simple",
            "actual": 6000,
            "p10": 4000,
            "p50": 6000,
            "p90": 10000,
            "actual_level": 4,
            "level": 4,
            "scale_source": "type",
        },
    ]
    baseline = comparison_metrics(points)
    evaluations = {
        name: {"v1": baseline, "candidate": baseline} for name in ("conditional", "filename_sensitivity")
    }
    changed = deepcopy(points)
    changed[0]["level"] = 2
    evaluations[definition]["candidate"] = comparison_metrics(changed)
    result = promotion_review({"passed": automatic}, evaluations, {"scaleSources": {"announced": 1}})
    assert result["promotionEligible"] is False
    assert definition in result["recommendation"] and "판정 재현율 하락" in result["recommendation"]
    assert result["recallSafety"][definition]["beforeMissed"] == 0
    assert result["recallSafety"][definition]["afterMissed"] == 1


# 구간 확대는 허용하되 기존 자동 게이트 실패·발표치 미사용은 제안 통과로 기록하지 않는다.
@pytest.mark.parametrize(
    "automatic,used,eligible", [(True, 1, True), (None, 1, True), (False, 1, False), (True, 0, False)]
)
def test_promotion_keeps_existing_gate(automatic: bool | None, used: int, eligible: bool) -> None:
    point = {
        "model": "simple",
        "actual": 1200,
        "p10": 800,
        "p50": 1200,
        "p90": 2000,
        "actual_level": 3,
        "level": 3,
        "scale_source": "announced" if used else "type",
    }
    baseline = comparison_metrics([point])
    wider = comparison_metrics([point | {"p10": 0, "p90": 5000}])
    assert wider["intervalWidthMedian"] == 5000 > baseline["intervalWidthMedian"]
    evaluations = {
        name: {"v1": baseline, "candidate": wider} for name in ("conditional", "filename_sensitivity")
    }
    result = promotion_review({"passed": automatic}, evaluations, {"scaleSources": {"announced": used}})
    assert result["promotionEligible"] is eligible
    assert result["recommendation"].startswith("승격 후보 제안" if eligible else "보류")
