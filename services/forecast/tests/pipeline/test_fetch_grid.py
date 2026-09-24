"""완전히 빠진 날짜·지역과 부모 시·인천 코드 단절을 기준 격자로 검증한다."""

from datetime import date, timedelta
from pathlib import Path

import polars as pl
import pytest
from crowdcast import paths
from crowdcast.pipeline import gates
from pipeline_fixtures import TODAY, region_frame


# 하루 전체나 한 지역 전체가 없어도 파일에 남은 값만으로 분모를 축소하지 않는다.
@pytest.mark.parametrize(("missing", "fraction"), [("day", "6/18=33.333333%"), ("region", "9/18=50.000000%")])
def test_wholly_missing_day_or_region(pipeline_root: Path, missing: str, fraction: str) -> None:
    frame = region_frame(3)
    frame = frame.filter(
        pl.col("date") != TODAY - timedelta(days=32)
        if missing == "day"
        else pl.col("sigungu_code") != "41800"
    )
    frame.write_parquet(paths.PROCESSED / "region_daily.parquet")
    gate = gates.fetch_gate(TODAY)
    assert gate["passed"] is False
    assert fraction in gate["message"]


# 수집 계획의 첫날이 통째 누락돼도 명시한 시작일을 분모에서 제거하지 않는다.
def test_planned_first_day_missing(pipeline_root: Path) -> None:
    gate = gates.fetch_gate(TODAY, TODAY - timedelta(days=33))
    assert gate["passed"] is False and "6/18=" in gate["message"]


# 부모 시는 방문자 대상이므로 빠지면 결측이고 경계에만 있는 지역은 대상이 아니다.
def test_reference_regions_include_parent_city(pipeline_root: Path) -> None:
    admin = pl.DataFrame(
        {
            "sigungu_code": ["41800", "51150", "41110", "41111"],
            "source": [["visitors"], ["visitors"], ["visitors"], ["boundary"]],
            "is_parent_city": [False, False, True, False],
        }
    )
    admin.write_parquet(paths.PROCESSED / "admin_dict.parquet")
    gate = gates.fetch_gate(TODAY)
    assert gate["passed"] is False and "6/18=" in gate["message"]


# 인천 구 개편일 이후만 단절 지역을 제외하며 개편 전 누락은 계속 계산한다.
def test_incheon_break_applies_from_change_date(pipeline_root: Path) -> None:
    pl.DataFrame(
        {
            "sigungu_code": ["41800", "51150", "28110"],
            "source": [["visitors"]] * 3,
        }
    ).write_parquet(paths.PROCESSED / "admin_dict.parquet")
    frame = region_frame(2, latest=date(2026, 7, 1))
    frame.write_parquet(paths.PROCESSED / "region_daily.parquet")
    gate = gates.fetch_gate(date(2026, 8, 1))
    assert gate["passed"] is False and "3/15=" in gate["message"]
    before = (
        frame.filter(pl.col("date") == date(2026, 6, 30))
        .head(3)
        .with_columns(pl.lit("28110").alias("sigungu_code"))
    )
    pl.concat([frame, before]).write_parquet(paths.PROCESSED / "region_daily.parquet")
    gate = gates.fetch_gate(date(2026, 8, 1))
    assert gate["passed"] is True and "0/15=" in gate["message"]
