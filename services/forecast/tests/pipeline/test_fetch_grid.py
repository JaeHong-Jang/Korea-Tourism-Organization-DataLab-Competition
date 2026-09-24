"""완전히 빠진 날짜·지역과 부모 시·인천 코드 단절을 기준 격자로 검증한다."""

from datetime import date, timedelta
from pathlib import Path

import polars as pl
import pytest
from crowdcast import paths
from crowdcast.data.crosswalk import PARENT_CITY_CODES
from crowdcast.pipeline import __main__ as cli
from crowdcast.pipeline import gates, stages
from pipeline_fixtures import TODAY, latest_record, region_frame, write_boundary


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
    # 지역이 사전에서도 사라졌을 때 경계 정본의 분모가 유지되는지 확인한다.
    admin = paths.PROCESSED / "admin_dict.parquet"
    if missing == "region":
        pl.read_parquet(admin).filter(pl.col("sigungu_code") != "41800").write_parquet(admin)
    gate = gates.fetch_gate(TODAY)
    assert gate["passed"] is False
    assert fraction in gate["message"]


# 수집 계획의 첫날이 통째 누락돼도 명시한 시작일을 분모에서 제거하지 않는다.
def test_planned_first_day_missing(pipeline_root: Path) -> None:
    gate = gates.fetch_gate(TODAY, TODAY - timedelta(days=33))
    assert gate["passed"] is False and "6/18=" in gate["message"]


# 기존 상수의 부모 시 12개와 경계에만 있는 지역도 관측 여부와 무관하게 분모에 포함한다.
def test_reference_regions_include_parent_city(pipeline_root: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(gates, "PARENT_CITY_CODES", PARENT_CITY_CODES)
    write_boundary(("41800", "51150", "41111"))
    (paths.PROCESSED / "admin_dict.parquet").unlink()
    assert set(gates.visitor_codes()["sigungu_code"]) == {"41800", "51150", "41111"} | PARENT_CITY_CODES
    gate = gates.fetch_gate(TODAY)
    assert gate["passed"] is False and "78/90=" in gate["message"]


# 인천 구 개편일 이후만 단절 지역을 제외하며 개편 전 누락은 계속 계산한다.
def test_incheon_break_applies_from_change_date(pipeline_root: Path) -> None:
    write_boundary(("41800", "51150", "28110"))
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


# 기준 파일이 없거나 잘못됐으면 수집·행사 호출 전에 중단하고 재시도도 하지 않는다.
@pytest.mark.parametrize("invalid", ["absent", "version", "empty", "duplicate", "code"])
def test_reference_checked_before_collection(
    pipeline_root: Path, monkeypatch: pytest.MonkeyPatch, invalid: str
) -> None:
    boundary = write_boundary()
    if invalid == "absent":
        boundary.unlink()
    elif invalid == "version":
        boundary.write_text(boundary.read_text().replace("20251231", "20261231"))
    else:
        write_boundary({"empty": (), "duplicate": ("41800", "41800"), "code": ("연천군",)}[invalid])

    # 외부 호출뿐 아니라 캐시 수집 실행도 허용하지 않아 사전 검증 순서를 입증한다.
    monkeypatch.setattr(stages, "collect_visitors", lambda *a, **kw: pytest.fail("기준 없이 수집"))
    monkeypatch.setattr(stages, "command", lambda *a: pytest.fail("기준 없이 행사 생성"))
    assert cli.main(["--to", "labels"]) == 1
    record = latest_record(pipeline_root)
    assert record["stages"][1]["status"] == "pending"
    assert "시도 2:" not in record["stages"][0]["gate"]["message"]


# admin_dict가 없는 최초 실행도 경계 기준을 먼저 읽고 행사 CLI까지 진행할 수 있다.
def test_first_fetch_without_admin_dictionary(pipeline_root: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    (paths.PROCESSED / "admin_dict.parquet").unlink()
    (paths.PROCESSED / "region_daily.parquet").unlink()
    calls = []

    # 최초 수집 결과를 기록하되 실제 외부 전송은 하지 않는다.
    def collect(*args: object, **kwargs: object) -> None:
        calls.append("visitors")
        region_frame(days=25).write_parquet(paths.PROCESSED / "region_daily.parquet")

    # 수집 산출물인 사전을 요구하지 않는지 dry와 실제 단계를 모두 확인한다.
    monkeypatch.setattr(stages, "collect_visitors", collect)
    monkeypatch.setattr(stages, "command", lambda entry, args: (calls.append(entry) or 0, ""))
    assert cli.main(["--to", "fetch"]) == 0
    assert calls == ["visitors", "crowdcast.data.events"]
    assert cli.main(["--dry", "--to", "fetch"]) == 0


# 경계 파일이 정본 수보다 적으면 기준 목록으로 쓰지 않는다(결측률 분모가 줄어 누락을 숨기지 않게).
def test_incomplete_boundary_is_rejected(pipeline_root: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    write_boundary(("41800", "51150"))
    monkeypatch.setattr(gates, "EXPECTED_BOUNDARY_CODES", 3)
    with pytest.raises(ValueError, match="정본 3개와 다름"):
        gates.visitor_codes()


# 개수는 같아도 코드 하나가 바뀐 경계는 정본 해시로 거부한다.
def test_swapped_boundary_code_is_rejected(pipeline_root: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    write_boundary(("41800", "51150"))
    monkeypatch.setattr(gates, "EXPECTED_BOUNDARY_SHA256", gates.code_set_sha256(["41800", "51151"]))
    with pytest.raises(ValueError, match="해시 불일치"):
        gates.visitor_codes()
