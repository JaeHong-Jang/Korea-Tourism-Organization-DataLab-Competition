"""인원 정수 표시는 원본 표본의 판정·확률을 보존하며 구간 문구와 일치해야 한다."""

from dataclasses import replace
from pathlib import Path

import numpy as np
import pytest
from crowdcast.api.assemble import forecast
from crowdcast.api.assemble.model import current_model
from crowdcast.rules.judge import JudgmentResult, judge
from crowdcast.rules.peak import PeakSamples, sample_peak
from fastapi.testclient import TestClient


# 사람 수의 모든 필드에 0.5 올림을 적용하고 결측·다른 단위·메타데이터는 보존한다.
@pytest.mark.parametrize("unit", ["명", "명/일", "비율", "%", "원"])
def test_quantity_half_up_and_units(unit: str) -> None:
    quantity = {"unit": unit, "value": 2002.5, "p10": 2002.49, "p50": 2002.5, "p90": None,
                "estimated": True, "assumptionIds": ["as-peak-day-factor"]}
    original = dict(quantity)
    result = forecast.people_quantity(quantity)
    expected = (2003, 2002, 2003) if unit in {"명", "명/일"} else (2002.5, 2002.49, 2002.5)
    assert tuple(result[key] for key in ("value", "p10", "p50")) == expected
    assert result["p90"] is None
    assert result["estimated"] is True and result["assumptionIds"] == quantity["assumptionIds"]
    assert quantity == original
    if unit in {"명", "명/일"}:
        assert all(type(result[key]) is int for key in ("value", "p10", "p50"))


# 반올림하면 경계를 넘는 표본으로 API가 원 확률과 등급을 유지하는지 확인한다.
@pytest.mark.parametrize("basis", ["확률", "구간"])
@pytest.mark.parametrize("samples,level,probabilities", [
    ([999.5] * 19 + [1000.49], 1, [0.05, 0.0]),
    ([999.5] * 11 + [1000.49] * 9, 2, [0.45, 0.0]),
    ([4999.5] * 11 + [5000.49] * 9, 3, [1.0, 0.45]),
])
def test_api_rounding_preserves_raw_judgment(
    client: TestClient, forecast_data: Path, event: dict, monkeypatch: pytest.MonkeyPatch,
    basis: str, samples: list[float], level: int, probabilities: list[float],
) -> None:
    event["hazards"] = []
    model, _ = current_model()
    monkeypatch.setitem(model.choice, "basis", basis)
    quantiles = [2002.49, 2002.5, 12416.5]
    monkeypatch.setattr(model, "infer", lambda frame: (
        quantiles, [], {"training_n": 5, "outside_features": [], "ood": False},
    ))
    peak = replace(sample_peak(quantiles, event, seed=2026), samples=np.asarray(samples))
    peak.samples.setflags(write=False)
    raw = judge(peak.samples, event, basis=basis)
    assert raw.judgment["level"] == level
    assert judge(np.floor(peak.samples + 0.5), event).judgment["level"] != level

    # 분포에 전달된 모델 출력은 원 소수 그대로이며 API는 이미 계산한 판정을 재사용한다.
    def fixed_distribution(values: list[float], supplied: dict, **kwargs: object) -> tuple[
        PeakSamples, JudgmentResult
    ]:
        assert values == [2002.49, 2002.5, 12416.5]
        assert supplied == event and kwargs["basis"] == basis
        return peak, raw

    monkeypatch.setattr(forecast, "distribution", fixed_distribution)
    response = client.post("/v1/predict", json=event)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["judgment"] == raw.judgment
    assert result["probabilities"] == raw.probabilities
    assert [item["probability"] for item in result["probabilities"]] == probabilities
    assert [result["dailyMean"][key] for key in ("p10", "p50", "p90")] == [2002, 2003, 12417]
    for name in ("dailyMean", "peakConcurrent"):
        assert result[name]["value"] is None
        assert all(type(result[name][key]) is int for key in ("p10", "p50", "p90"))
    if basis == "구간":
        expected = (f"표본 한계로 구간 기준 표시 · 순간 최대 {result['peakConcurrent']['p10']:,}"
                    f"~{result['peakConcurrent']['p90']:,}명 · 추정 산식 기반")
        assert all(item["display"] == expected for item in result["probabilities"])
    assert quantiles == [2002.49, 2002.5, 12416.5]
    np.testing.assert_array_equal(peak.samples, samples)
    assert response.content == client.post("/v1/predict", json=event).content


# 실제 분포 생성부터 API 조립까지 같은 원 표본으로 등급·확률·인원 구간을 연결한다.
@pytest.mark.parametrize("basis", ["확률", "구간"])
def test_real_distribution_display(
    client: TestClient, forecast_data: Path, event: dict, monkeypatch: pytest.MonkeyPatch, basis: str,
) -> None:
    from crowdcast.api.assemble.inputs import cutoff
    from crowdcast.api.assemble.observations import feature_frame
    from crowdcast.models.distribution import distribution

    # 실제 발행 모델의 원 분위수와 표본을 API 바깥에서 계산해 조립 결과를 대조한다.
    model, _ = current_model()
    monkeypatch.setitem(model.choice, "basis", basis)
    frame = feature_frame(event, cutoff(event), model.encoding["features"])
    quantiles, _, _ = model.infer(frame)
    peak, raw = distribution(
        quantiles, event, seed=model.config["seed"], n=model.config["samples"], basis=basis,
    )
    response = client.post("/v1/predict", json=event)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["judgment"] == raw.judgment
    assert result["probabilities"] == raw.probabilities
    for source, name in (
        (quantiles, "dailyMean"), (np.quantile(peak.samples, [0.1, 0.5, 0.9]), "peakConcurrent"),
    ):
        assert all(abs(result[name][key] - value) <= 0.5
                   for key, value in zip(("p10", "p50", "p90"), source, strict=True))
        assert all(type(result[name][key]) is int for key in ("p10", "p50", "p90"))
    if basis == "구간":
        interval = f"{result['peakConcurrent']['p10']:,}~{result['peakConcurrent']['p90']:,}명"
        assert all(interval in item["display"] for item in result["probabilities"])
        assert all("표본 한계" not in reason["text"] and not any(char.isdigit() for char in reason["text"])
                   for reason in result["judgment"]["reasons"])
    assert response.content == client.post("/v1/predict", json=event).content
