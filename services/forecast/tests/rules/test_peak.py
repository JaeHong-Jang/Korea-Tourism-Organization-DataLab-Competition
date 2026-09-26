"""환산 가정의 범위·재현성·단조 분위수와 계약의 추정 표시를 검증한다."""

from typing import Any

import numpy as np
import pytest
from crowdcast.api.contract import validate
from crowdcast.rules.peak import _daily_samples, sample_peak
from jsonschema import Draft202012Validator


# 정본의 일곱 유형 모두 두 가정과 계약에 맞는 근거를 생성해야 한다.
@pytest.mark.parametrize("event_type", ["불꽃", "공연", "대학", "먹거리", "꽃", "전통", "기타"])
def test_profiles_use_registered_assumptions(
    event: dict[str, Any],
    master_ids: dict[str, Any],
    common_validator: Draft202012Validator,
    event_type: str,
) -> None:
    event["type"] = event_type
    result = sample_peak({"p10": 7400, "p50": 13000, "p90": 22000}, event, seed=2026)
    quantity = result.quantity("q-yeongjong-peak")
    assert result.samples.shape == (4000,)
    assert quantity["p10"] <= quantity["p50"] <= quantity["p90"]
    assert quantity["estimated"] is True
    assert len(result.assumption_ids) == len(set(result.assumption_ids)) == 2
    assert set(result.assumption_ids) <= set(master_ids["assumptions"])
    common_validator.evolve(schema={"$ref": "common.schema.json#/$defs/peakQuantity"}).validate(quantity)
    for assumption, evidence in zip(result.assumptions, result.evidence, strict=True):
        common_validator.evolve(schema={"$ref": "common.schema.json#/$defs/assumption"}).validate(assumption)
        assert evidence["assumptionId"] == assumption["id"]
        assert evidence["checkResult"] is None
        validate("evidence", evidence)


# 한국 날짜의 주말 포함 여부와 개최 일수 구간을 빠짐없이 확인한다.
@pytest.mark.parametrize(
    ("start", "end", "factor"),
    [
        ("2026-09-21T10:00:00+09:00", "2026-09-21T18:00:00+09:00", 1.0),
        ("2026-09-21T10:00:00+09:00", "2026-09-22T18:00:00+09:00", 1.3),
        ("2026-09-21T10:00:00+09:00", "2026-09-23T18:00:00+09:00", 1.3),
        ("2026-09-21T10:00:00+09:00", "2026-09-24T18:00:00+09:00", 1.5),
        ("2026-09-25T10:00:00+09:00", "2026-09-27T18:00:00+09:00", 1.4),
        ("2026-09-25T15:00:00Z", "2026-09-25T18:00:00Z", 1.1),
        ("2026-09-21T10:00:00+09:00", "2026-10-01T18:00:00+09:00", 1.6),
    ],
)
def test_peak_day_calendar(event: dict[str, Any], start: str, end: str, factor: float) -> None:
    event.update(startsAt=start, endsAt=end)
    day = sample_peak([100, 100, 100], event, seed=1).assumptions[0]
    assert day["value"] == pytest.approx(factor)
    assert day["low"] == pytest.approx(factor - 0.2)
    assert day["high"] == pytest.approx(factor + 0.2)


# 세 분위수와 연속적인 양쪽 꼬리가 하나의 단조 역누적분포를 이룬다.
def test_daily_quantile_interpolation_and_tails() -> None:
    values = np.array([100.0, 1000.0, 10000.0])
    probabilities = np.array([0.001, 0.09999, 0.1, 0.10001, 0.5, 0.89999, 0.9, 0.90001, 0.999])
    samples = _daily_samples(values, probabilities)
    assert np.all(np.diff(samples) >= 0)
    np.testing.assert_allclose(samples[[2, 4, 6]], values)
    assert samples[0] < values[0] and samples[-1] > values[-1]
    assert samples[3] - samples[1] < 1
    assert samples[7] - samples[5] < 10


# 같은 seed·입력은 표본과 근거를 그대로 재현하며 전역 난수 상태를 건드리지 않는다.
def test_reproducibility_and_crossed_quantiles(event: dict[str, Any]) -> None:
    state = np.random.get_state()
    first = sample_peak([13000, 22000, 7400], event, seed=42)
    second = sample_peak([7400, 13000, 22000], event, seed=42)
    third = sample_peak([7400, 13000, 22000], event, seed=43)
    np.testing.assert_array_equal(first.samples, second.samples)
    assert first.evidence == second.evidence
    assert not np.array_equal(second.samples, third.samples)
    np.testing.assert_array_equal(state[1], np.random.get_state()[1])
    with pytest.raises(ValueError):
        first.samples[0] = 0


# 일평균이 일정하면 환산 표본은 두 가정의 곱 범위를 벗어나지 않는다.
@pytest.mark.parametrize("event_type", ["불꽃", "공연", "대학", "먹거리", "꽃", "전통", "기타"])
def test_two_sampled_ranges(event: dict[str, Any], event_type: str) -> None:
    event["type"] = event_type
    result = sample_peak([1000, 1000, 1000], event, n=20000, seed=2026)
    day, concurrency = result.assumptions
    assert np.min(result.samples) >= 1000 * day["low"] * concurrency["low"] - 1e-9
    assert np.max(result.samples) <= 1000 * day["high"] * concurrency["high"] + 1e-9
    assert np.std(result.samples) > 0
    if event_type == "불꽃":
        assert np.mean(result.samples) == pytest.approx(1000 * day["value"] * 0.95, rel=0.01)


# 영인원과 단일 표본도 음수·비유한 수 없이 계약에 맞게 환산한다.
def test_zero_and_single_sample(event: dict[str, Any]) -> None:
    result = sample_peak([0, 0, 0], event, n=1, seed=0)
    assert result.samples.tolist() == [0]
    assert result.quantity("q-zero-peak")["p90"] == 0


# 잘못된 분포가 그럴듯한 예측으로 처리되지 않도록 거부한다.
@pytest.mark.parametrize("values", [[-1, 0, 1], [1, float("nan"), 2], [1, 2, float("inf")], [1, 2]])
def test_invalid_quantiles(event: dict[str, Any], values: list[float]) -> None:
    with pytest.raises(ValueError):
        sample_peak(values, event, seed=0)


# 표본 수·seed·시간대·기간·유형 오류는 계산 전에 드러나야 한다.
@pytest.mark.parametrize(
    "changes",
    [{"n": 0}, {"n": True}, {"n": 1.5}, {"seed": -1}, {"seed": True}, {"seed": None}],
)
def test_invalid_sampling_options(event: dict[str, Any], changes: dict[str, Any]) -> None:
    with pytest.raises(ValueError):
        sample_peak([1, 2, 3], event, **{"seed": 0, **changes})


# 한국 날짜 산정이 불가능하거나 계약 밖 유형이면 대체값을 추측하지 않는다.
@pytest.mark.parametrize(
    "changes",
    [{"startsAt": "2025-10-18T19:00:00"}, {"endsAt": "2025-10-17T19:00:00+09:00"}, {"type": "미상"}],
)
def test_invalid_event(event: dict[str, Any], changes: dict[str, Any]) -> None:
    with pytest.raises(ValueError):
        sample_peak([1, 2, 3], {**event, **changes}, seed=0)
