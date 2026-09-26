"""DIY의 중소 행사 우선·균형·재현성과 두 표의 Pandera 검증 실패를 확인한다."""

import json
from datetime import date
from pathlib import Path

import pandera.errors
import polars as pl
import pytest
from crowdcast.data import DIY_SCHEMA, EVENT_TYPES, FESTIVAL_DTYPES, FESTIVAL_SCHEMA
from crowdcast.data.diy_targets import select_targets
from crowdcast.data.mcst_festivals import quality_report
from polars.testing import assert_frame_equal


# 실제 한국 행사·지역의 조합을 반복해 균형 선택에 충분한 합성 모집단을 만든다.
def festivals() -> pl.DataFrame:
    examples = [
        ("서울드럼페스티벌", "서울특별시", "중구", "서울광장", "공연"),
        ("탐라국 입춘굿", "제주특별자치도", "제주시", "제주목관아", "전통"),
        ("춘천막국수닭갈비축제", "강원특별자치도", "춘천시", "공지천", "먹거리"),
        ("제주유채꽃축제", "제주특별자치도", "서귀포시", "가시리", "꽃"),
    ]
    rows = []
    for i in range(90):
        name, sido, sigungu, venue, kind = examples[i % len(examples)]
        start = date(2023 + i % 3, 1 + i // 12, 1 + i % 12)
        rows.append(
            {
                "year": start.year,
                "festival_name": name,
                "sido": sido,
                "sigungu_name": sigungu,
                "venue": venue,
                "type": kind,
                "type_raw": kind,
                "start_date": start,
                "end_date": start,
                "days": 1,
                "host": None,
                "budget_krw": None,
                "date_text": start.isoformat(),
                "planned_month": start.month,
                "visitors_announced": 1000 if i < 72 else 500_000,
                "visitors_announced_meaning": "전년도 방문객",
                "source_file": "합성.xlsx",
                "source_sheet": "세부현황",
                "source_row": i + 5,
            }
        )
    return pl.DataFrame(rows, schema=FESTIVAL_DTYPES)


# 입력 순서가 바뀌어도 같은 60개를 골라 지역·유형·연도가 모두 포함되게 한다.
def test_small_first_balanced_and_reproducible() -> None:
    source = festivals()
    selected = select_targets(source)
    assert selected.height == 60
    assert selected["priority"].to_list() == list(range(1, 61))
    assert selected["visitors_announced"].max() == 1000
    assert selected["sido"].n_unique() == 3
    assert selected["year"].n_unique() == 3
    joined = selected.join(
        source.select("source_row", "festival_name", "year", "start_date", "type"),
        on=["festival_name", "year", "start_date"],
    )
    assert joined["type"].n_unique() == 4
    assert joined.group_by("type").len()["len"].min() >= 10
    assert_frame_equal(selected, select_targets(source.reverse()))


# 중소 후보가 부족하면 이후 순위에만 보완하고 이유를 명시한다.
def test_fallback_after_preferred_candidates() -> None:
    source = festivals().with_columns(
        pl.when(pl.col("source_row") < 15)
        .then(500)
        .otherwise(None)
        .cast(pl.Int64)
        .alias("visitors_announced")
    )
    selected = select_targets(source)
    assert selected.head(10)["visitors_announced"].to_list() == [500] * 10
    assert selected.slice(10)["why"].str.contains("후 보완").all()


# 불확정 장소·일정과 범위 밖 연도는 제외하고 중복 행사로 최소 건수를 채우지 않는다.
def test_exclude_unusable_and_duplicate_rows() -> None:
    source = festivals()
    invalid = source.head(4).with_columns(
        pl.lit("다른원본.xlsx").alias("source_file"),
        pl.lit(None, dtype=pl.Date).alias("start_date"),
    )
    duplicate = source.head(10).with_columns(pl.lit("중복원본.xlsx").alias("source_file"))
    assert_frame_equal(select_targets(source), select_targets(pl.concat([source, invalid, duplicate])))
    with pytest.raises(ValueError, match="후보 부족"):
        select_targets(source.with_columns(pl.lit("장소 미정").alias("venue")))
    with pytest.raises(ValueError, match="후보 부족"):
        select_targets(source.head(50))
    with pytest.raises(ValueError, match="60건 이상"):
        select_targets(source, count=59)


# 표의 타입·일수·날짜 역전·원본 중복을 모두 Pandera가 직접 거부해야 한다.
@pytest.mark.parametrize(
    "change",
    [
        pl.lit(0).alias("days"),
        pl.lit(-1).alias("budget_krw"),
        pl.lit(-1).alias("visitors_announced"),
        pl.lit("1").alias("days"),
        pl.lit(date(2022, 1, 1)).alias("end_date"),
        pl.lit(2).alias("days"),
        pl.lit("잘못된 유형").alias("type"),
        pl.lit(2016).alias("year"),
        pl.lit(None, dtype=pl.Int64).alias("days"),
        pl.lit(0).alias("planned_month"),
        pl.lit(13).alias("planned_month"),
        pl.lit("10").alias("planned_month"),
        pl.lit(10).alias("date_text"),
    ],
)
def test_festival_schema_rejects_bad_values(change: pl.Expr) -> None:
    with pytest.raises(pandera.errors.SchemaErrors):
        FESTIVAL_SCHEMA.validate(festivals().with_columns(change), lazy=True)


# DIY 조회에 필요한 위치·날짜와 고유 우선순위가 누락되면 저장할 수 없다.
@pytest.mark.parametrize(
    "change",
    [
        pl.lit(None, dtype=pl.Date).alias("start_date"),
        pl.lit(0).alias("days"),
        pl.lit(None, dtype=pl.String).alias("venue"),
        pl.lit(1).alias("priority"),
        pl.lit(date(2022, 1, 1)).alias("end_date"),
        pl.lit(2026).alias("year"),
    ],
)
def test_diy_schema_rejects_bad_values(change: pl.Expr) -> None:
    with pytest.raises(pandera.errors.SchemaErrors):
        DIY_SCHEMA.validate(select_targets(festivals()).with_columns(change), lazy=True)


# QC는 없는 연도·모든 필수 열·미매핑 유형을 숨기지 않는다.
def test_quality_report_and_contract_types() -> None:
    source = festivals().with_columns(pl.lit("복합 행사").alias("type_raw"))
    report = quality_report(source)
    assert "| 2017 | 0 | 미달 |" in report
    assert "| 복합 행사 | 90 |" in report
    assert all(f"| {column} |" in report for column in FESTIVAL_DTYPES)
    assert "| 연도 | 예산 채움 수 | 예산 채움률 | planned_month 채움 수 | planned_month 채움률 |" in report
    assert "| 2023 | 0 | 0.00% | 30 | 100.00% |" in report
    assert "| 2023 | 30 | 100.00% | 45.00% | 통과 |" in report
    assert "| 2024 | 30 | 100.00% | 45.00% | 통과 |" in report
    assert "| 2025 | 30 | 100.00% | 59.00% | 통과 |" in report
    contract = Path(__file__).resolve().parents[4] / "packages/contracts/schemas/common.schema.json"
    assert list(EVENT_TYPES) == json.loads(contract.read_text())["$defs"]["eventType"]["enum"]


# 종료일만 남은 행도 미완성 날짜로 집계하고 기준 미달을 보고한다.
def test_quality_report_counts_complete_dates() -> None:
    source = festivals().with_columns(pl.lit(None, dtype=pl.Date).alias("start_date"))
    report = quality_report(source)
    assert "| 2023 | 0 | 0.00% | 45.00% | 미달 |" in report
    assert "| 2024 | 0 | 0.00% | 45.00% | 미달 |" in report
    assert "| 2025 | 0 | 0.00% | 59.00% | 미달 |" in report


# 완전 중복 원본 위치는 행사 수를 부풀리므로 정규화 표에서 거부한다.
def test_duplicate_source_is_invalid() -> None:
    source = festivals()
    with pytest.raises(pandera.errors.SchemaErrors):
        FESTIVAL_SCHEMA.validate(pl.concat([source, source.head(1)]), lazy=True)
