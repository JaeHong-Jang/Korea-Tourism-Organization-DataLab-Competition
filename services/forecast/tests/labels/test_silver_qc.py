"""실버 부호 검사의 엄격한 경계·원래 모집단·직전 표본 감소를 검증한다."""

from typing import Any

import pytest
from crowdcast.labels.merge import merge_labels
from crowdcast.labels.silver_qc import enforce_silver_gate, signal_retention, silver_lines, silver_metrics


# 숫자 경계 검증은 반올림과 학습 플래그에 영향받지 않는 원래 후보로 수행한다.
def candidate(index: int, daily: float, sigma: float = 1) -> dict[str, Any]:
    return {
        "event_id": f"연천-{index}",
        "festival_name": "연천구석기축제",
        "year": 2025,
        "sido": "경기도",
        "type": "전통",
        "start": "2025-10-05",
        "end": "2025-10-05",
        "daily_mean": daily,
        "sigma": sigma,
        "snr": daily / sigma if sigma else None,
        "baseline_mean": 100.0,
        "baseline_sample_count": 4,
        "holiday_dates": ["2025-10-05"],
    }


# 유의 음수 비율은 정확히 5%에서 실패하고 엄격한 |SNR| 경계는 ±3을 제외한다.
@pytest.mark.parametrize("positive,passed", [(19, False), (20, True)])
def test_significant_negative_boundary(positive: int, passed: bool) -> None:
    rows = [candidate(0, -3.00000001)] + [candidate(i + 1, 4) for i in range(positive)]
    rows += [candidate(100, -3), candidate(101, 3), candidate(102, 10, 0)]
    metrics = silver_metrics(rows, merge_labels([], set()))
    assert metrics["significant_count"] == positive + 1
    assert metrics["significant_negative"]["status"] == ("pass" if passed else "fail")
    assert metrics["significant_negative"]["numerator"] == 1
    assert metrics["zero_sigma_count"] == metrics["missing_snr_count"] == 1
    assert metrics["holiday_by_year_type"][0]["holiday_overlap_count"] == len(rows)
    assert metrics["holiday_by_year_type"][0]["usable_remaining_count"] == 0
    assert metrics["significant_negative_cases"][0]["baseline_mean"] == 100


# 전체 음수율은 정확히 40%를 허용하며 반올림으로 0이 되는 작은 음수도 센다.
@pytest.mark.parametrize("negative,passed", [(2, True), (3, False)])
def test_all_negative_boundary(negative: int, passed: bool) -> None:
    rows = [candidate(i, -1e-9 if i < negative else 10) for i in range(5)]
    metrics = silver_metrics(rows, merge_labels([], set()))
    assert metrics["all_negative"]["numerator"] == negative
    assert metrics["all_negative"]["denominator"] == 5
    assert metrics["all_negative"]["status"] == ("pass" if passed else "fail")
    assert metrics["increment_by_year_sido"][0]["negative_count"] == negative


# 직전 대비 80%는 허용하고 최초 실행·같은 스냅샷 재실행은 비교 근거를 보존한다.
@pytest.mark.parametrize("current,status", [(79, "fail"), (80, "pass")])
def test_signal_retention_boundary(current: int, status: str) -> None:
    first = signal_retention({"significant_count": 100}, None, "기존")
    previous = {"snapshot_sha256": "기존", "silver": {"significant_count": 100, "signal_retention": first}}
    assert signal_retention({"significant_count": 100}, previous, "기존") == first
    check = signal_retention({"significant_count": current}, previous, "신규")
    assert check["status"] == status and check["denominator"] == 100


# 후보·유의 신호 분모가 없으면 성공 산출물을 발행하지 않는다.
@pytest.mark.parametrize("rows", [[], [candidate(0, 3)], [candidate(0, 10, 0)]])
def test_zero_signal_fails_with_diagnostics(rows: list[dict[str, Any]]) -> None:
    metrics = silver_metrics(rows, merge_labels([], set()))
    metrics["signal_retention"] = signal_retention(metrics, None, "첫 입력")
    assert metrics["zero_significant_count"] == 1
    with pytest.raises(ValueError, match="실버 부호 검사 실패"):
        enforce_silver_gate(metrics)
    assert "가설:" in "\n".join(silver_lines(metrics))
