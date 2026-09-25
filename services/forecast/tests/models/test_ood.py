"""분포 밖 입력 판정이 학습 범위가 있는 피처만 검사하는지 확인한다."""

from crowdcast.models.ood import detect_ood


# 학습에서 전부 결측이던 피처(예: 시간대)는 값이 있어도 OOD 사유가 아니다 — 범위가 있는 피처만 검사한다.
def test_unlearned_feature_is_not_out_of_range() -> None:
    fitted = {"counts": {"5:>5000": 9}, "ranges": {"time_of_day": [None, None], "month": [4.0, 10.0]}}
    row = {"type": 5.0, "time_of_day": 2.0, "month": 5.0}
    assert detect_ood(row, 12000.0, fitted)["outside_features"] == []
    assert detect_ood({**row, "month": 12.0}, 12000.0, fitted)["outside_features"] == ["month"]
