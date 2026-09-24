"""실버 부호 검사의 엄격한 경계·원래 모집단·직전 표본 감소를 검증한다."""

from typing import Any

import pytest
from crowdcast.labels.merge import merge_labels
from crowdcast.labels.schema import label_row
from crowdcast.labels.silver_qc import enforce_silver_gate, silver_lines, silver_metrics
from crowdcast.labels.silver_signal import signal_retention
from label_fixtures import festival


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


# 전체 음수율은 정확히 50%에서 경고하지 않으며 50% 초과도 파일 저장을 막지 않는다.
@pytest.mark.parametrize("negative,status", [(30, "pass"), (31, "warn")])
def test_all_negative_boundary(negative: int, status: str) -> None:
    rows = [candidate(i, -1e-9 if i < negative else 10) for i in range(61 if negative == 31 else 60)]
    metrics = silver_metrics(rows, merge_labels([], set()))
    assert metrics["all_negative"]["numerator"] == negative
    assert metrics["all_negative"]["denominator"] == len(rows)
    assert metrics["all_negative"]["status"] == status
    assert metrics["increment_by_year_sido"][0]["negative_count"] == negative
    metrics["signal_retention"] = signal_retention(metrics, None, "첫 입력")
    enforce_silver_gate(metrics)


# σ가 있는데 SNR이 없거나 유한하지 않으면 정상 신호가 많아도 계산 오류로 중단한다.
@pytest.mark.parametrize("snr", [None, float("nan"), float("inf")])
def test_invalid_snr_stops(snr: float | None) -> None:
    rows = [candidate(i, 10) for i in range(31)]
    rows[0]["snr"] = snr
    metrics = silver_metrics(rows, merge_labels([], set()))
    metrics["signal_retention"] = signal_retention(metrics, None, "첫 입력")
    with pytest.raises(ValueError, match="missing_snr|invalid_snr"):
        enforce_silver_gate(metrics)


# σ=0의 후보는 분모에 남지만 유의 표본과 대표 학습 표본에는 포함하지 않는다.
def test_holiday_counts_only_primary_training_labels() -> None:
    event = festival(event_id="연천-0")
    silver = label_row(event, "silver", "방문자.parquet", "1")
    silver.update(daily_mean=10, total=40, days=4, snr=10, method="합성 실버")
    gold = {**silver, "label_tier": "goldA", "spatial_scope": "행사장"}
    rows = [candidate(0, 10), candidate(1, 10, 0)]
    for row in rows:
        row["holiday_dates"] = []
    metrics = silver_metrics(rows, merge_labels([silver, gold], set()))
    assert metrics["candidate_count"] == 2 and metrics["significant_count"] == 1
    assert metrics["holiday_by_year_type"][0]["usable_remaining_count"] == 0


# 후보·유의 신호 분모가 없으면 성공 산출물을 발행하지 않는다.
@pytest.mark.parametrize("rows", [[], [candidate(0, 3)], [candidate(0, 10, 0)]])
def test_zero_signal_fails_with_diagnostics(rows: list[dict[str, Any]]) -> None:
    metrics = silver_metrics(rows, merge_labels([], set()))
    metrics["signal_retention"] = signal_retention(metrics, None, "첫 입력")
    assert metrics["zero_significant_count"] == 1
    with pytest.raises(ValueError, match="실버 부호 검사 실패"):
        enforce_silver_gate(metrics)
    assert "가설:" in "\n".join(silver_lines(metrics))
