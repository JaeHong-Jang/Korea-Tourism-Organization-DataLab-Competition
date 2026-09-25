"""정의 불일치·빈 표본·두 분포·지역 단위와 월별 중복 제거를 검증한다."""

import json
from datetime import date

import polars as pl
import pytest
from crowdcast.analytics.insights import i1, i2, i3, i4, i5, i6, regional_pairs
from crowdcast.analytics.insights.__main__ import calculate
from crowdcast.analytics.insights.records import Inputs
from crowdcast.api.contract import validate


# 빈 입력에서도 여섯 지표와 활용 명세가 계약에 맞고 결측을 실측 영으로 설명하지 않는다.
def test_empty_outputs() -> None:
    outputs = calculate(Inputs("2026-09-25T12:00:00+09:00"), {})
    assert len(outputs) == 7
    for key, result in outputs.items():
        validate("datalab-spec" if key == "datalab-spec" else "insight", result)
        if key != "datalab-spec":
            assert result["sampleSize"] == 0
            assert "표본 없음" in result["headline"]["text"]
            assert result["evidenceIds"] == [item["id"] for item in result["evidence"]]
    assert outputs["datalab-spec"]["rows"] == []


# 같은 해·장소·일수의 사후 발표 누적치만 실측과 비교한다.
def test_i1_comparable_quartiles(inputs: Inputs) -> None:
    rows = inputs.events.to_dicts()
    for index, row in enumerate(rows):
        row.update(
            visitors_announced=10000 * (index + 1),
            visitors_announced_year=2025,
            visitors_announced_available_at=date(2025, 8, 1),
            visitors_announced_start=row["start"],
            visitors_announced_end=row["end"],
            visitors_announced_spatial_scope="행사장",
            visitors_announced_time_unit="기간 누적",
        )
    inputs.events = pl.DataFrame(rows)
    result = i1.calculate(inputs)
    assert result["comparablePairs"] == 3
    assert result["headline"]["value"] == 2
    assert sum(row["value"] for row in result["series"]) == 3
    details = json.loads(result["evidence"][0]["summary"])
    assert [details["q25"], details["median"], details["q75"]] == [1.5, 2, 2.5]
    validate("insight", result)


# 발표 시점·연도·공간·기간·라벨 정의 중 하나만 달라도 쌍을 제외한다.
@pytest.mark.parametrize(
    "field,value,target",
    [
        ("visitors_announced_available_at", None, "event"),
        ("visitors_announced_year", 2024, "event"),
        ("visitors_announced_spatial_scope", "시군구", "event"),
        ("visitors_announced_time_unit", "순간", "event"),
        ("days", 3, "label"),
        ("definition", "기간 합계", "label"),
        ("spatial_scope", "시군구", "label"),
        ("daily_mean", 0, "label"),
        ("label_tier", "silver", "label"),
        ("is_primary", False, "label"),
    ],
)
def test_i1_mismatch_excluded(inputs: Inputs, field: str, value: object, target: str) -> None:
    event, label = inputs.events.to_dicts()[0], inputs.labels.to_dicts()[0]
    event.update(
        visitors_announced=20000,
        visitors_announced_year=2025,
        visitors_announced_available_at=date(2025, 8, 1),
        visitors_announced_start=event["start"],
        visitors_announced_end=event["end"],
        visitors_announced_spatial_scope="행사장",
        visitors_announced_time_unit="기간 누적",
    )
    assert i1.comparable(event, label) == 2
    (event if target == "event" else label)[field] = value
    assert i1.comparable(event, label) is None


# 전년 수치의 메타 누락을 묵시적으로 현재 행사 실측과 짝짓지 않는다.
def test_i1_missing_metadata_is_zero(inputs: Inputs) -> None:
    result = i1.calculate(inputs)
    assert result["comparablePairs"] == 0
    assert "표본 없음" in result["headline"]["text"]


# 다음 해 계획서의 전년 발표값은 당해 라벨 대신 같은 이름·지역의 전년 실측과 연결한다.
def test_i1_prior_year_alignment(inputs: Inputs) -> None:
    actual = inputs.events.to_dicts()[0]
    announcement = {
        **actual,
        "event_id": "e-41800-2026",
        "year": 2026,
        "start": date(2026, 5, 2),
        "end": date(2026, 5, 5),
        "visitors_announced": 20000,
        "visitors_announced_year": 2025,
        "visitors_announced_available_at": date(2026, 1, 1),
        "visitors_announced_start": actual["start"],
        "visitors_announced_end": actual["end"],
        "visitors_announced_spatial_scope": "행사장",
        "visitors_announced_time_unit": "기간 누적",
    }
    inputs.events = pl.DataFrame([actual, announcement])
    result = i1.calculate(inputs)
    assert result["sampleSize"] == 1
    assert result["headline"]["value"] == 2
    assert result["period"] == {"from": "2025-07-05", "to": "2025-07-06"}


# 모델과 발표 환산 각각 네 등급을 내고 다른 표본 분모·편중을 공개한다.
def test_i2_two_distributions(inputs: Inputs) -> None:
    result = i2.calculate(inputs)
    assert len(result["series"]) == 8
    assert [row["value"] for row in result["series"][:4]] == [0, 0, 0, 3]
    assert sum(row["value"] for row in result["series"][4:]) == 2
    assert result["series"][4]["value"] == 1
    assert result["comparablePairs"] == 2
    assert "4등급에 편중" in result["headline"]["text"]
    assert "사전 예상치가 아닙니다" in result["headline"]["text"]
    assert any(item["kind"] == "assumption" for item in result["evidence"])
    validate("insight", result)


# 동시체류율은 설정값을 사용하며 유형 중앙값을 피크일 계수와 중복 환산하지 않는다.
def test_i3_type_scale(inputs: Inputs) -> None:
    result = i3.calculate(inputs)
    actual = {item["label"].split(" · ")[0]: item["value"] for item in result["series"]}
    assert actual == pytest.approx({"전통": 4000, "먹거리": 3600, "공연": 9000})
    assert result["sampleSize"] == 3
    assert "추정" in result["headline"]["text"]


# 일평균 행사장 라벨을 시군구 분모에 나누지 않고 같은 지역 관측으로 계산한다.
def test_i4_i5_same_region_and_denominator(inputs: Inputs) -> None:
    pairs = regional_pairs.calculate(inputs)
    assert len(pairs) == 3
    result = i4.calculate(inputs, pairs)
    assert result["headline"]["value"] == pytest.approx(5 / 3)
    assert len(result["series"]) == 3
    for pair in pairs:
        assert pair["baseline_to"] <= "2025-05-17"
    shares = i5.calculate(inputs, pairs)
    assert [row["value"] for row in shares["series"]] == pytest.approx([0.6, 1 / 3])
    assert "유입 권역은 자료 없음(H7)" in shares["headline"]["text"]
    assert "H7" in shares["evidence"][0]["summary"]
    validate("insight", result)
    validate("insight", shares)


# 불완전한 행사일·미공개 관측·행정 연속성 단절은 비교 분모에서 제외한다.
@pytest.mark.parametrize("failure", ["missing_group", "unpublished", "continuity"])
def test_regional_pair_exclusion(inputs: Inputs, failure: str) -> None:
    event_day = (pl.col("sigungu_code") == "41800") & (pl.col("date") == date(2025, 7, 5))
    if failure == "missing_group":
        inputs.region = inputs.region.filter(~(event_day & (pl.col("tou_div") == "외국인")))
    elif failure == "unpublished":
        inputs.region = inputs.region.with_columns(
            pl.when(event_day).then(date(2027, 1, 1)).otherwise(pl.col("available_at")).alias("available_at")
        )
    else:
        inputs.region = inputs.region.with_columns(event_day.alias("continuity_break"))
    pairs = regional_pairs.calculate(inputs)
    assert len(pairs) == 2
    assert all(row["sigungu_code"] != "41800" for row in pairs)


# 개최계획서 원본과 예보에 동시에 있는 행사를 두 번 세지 않고 미예보 인원은 영으로 채우지 않는다.
def test_i6_deduplicates_and_keeps_missing_forecast(inputs: Inputs) -> None:
    inputs.plans = pl.concat([inputs.plans, inputs.plans])
    inputs.forecasts = inputs.forecasts[:1]
    result = i6.calculate(inputs)
    assert result["sampleSize"] == 3
    assert result["comparablePairs"] == 1
    assert sum(row["value"] for row in result["series"] if "행사 수" in row["label"]) == 3
    assert len([row for row in result["series"] if "인파 합" in row["label"]]) == 1
    assert result["headline"]["value"] == 6000
    assert result["period"] == {"from": "2025-01-01", "to": "2025-12-31"}
