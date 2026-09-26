"""평시의 정확한 네 주 평균·공개일·행정구역 단절과 결측 처리를 검증한다."""

from datetime import date, timedelta

import polars as pl
import pytest
from crowdcast import paths
from crowdcast.api.assemble import inputs
from crowdcast.api.contract import validate
from fastapi.testclient import TestClient


# 응답의 모든 요일 값을 원본 날짜·집단별 독립 평균과 대조한다.
def test_four_week_means(client: TestClient, region_data: pl.DataFrame) -> None:
    before = date(2025, 10, 4)
    query = {"sigunguCode": "28110", "before": before.isoformat()}
    response = client.get("/v1/baseline", params=query)
    assert response.status_code == 200
    result = response.json()
    validate("region-baseline", result)
    rows = [
        row
        for row in region_data.to_dicts()
        if row["sigungu_code"] == "28110"
        and before - timedelta(days=28) <= row["date"] < before
        and row["available_at"] <= before
    ]
    for entry in result["weekdayMean"]:
        for field, group in (("local", "현지인"), ("nonlocal", "외지인"), ("foreign", "외국인")):
            values = [
                row["visitors"]
                for row in rows
                if row["tou_div"] == group and row["date"].weekday() == entry["weekday"]
            ]
            assert entry[field] == pytest.approx(sum(values) / len(values))
    nonlocal_sum = sum(row["visitors"] for row in rows if row["tou_div"] == "외지인")
    assert result["nonlocalShare"] == pytest.approx(nonlocal_sum / sum(row["visitors"] for row in rows))
    assert result["evidenceId"] == result["evidence"][0]["id"]
    assert result["evidence"][0]["availableAt"] <= query["before"]
    assert result["evidence"][0]["source"]["datasetId"] == "ds-kto-visitors-15101972"
    assert client.get("/v1/baseline", params=query).content == response.content


# 하루의 한 집단이 미공개면 공개된 두 집단도 그날 구성비에 섞지 않는다.
def test_unpublished_group_excludes_whole_day(client: TestClient, region_data: pl.DataFrame) -> None:
    last = date(2025, 10, 3)
    changed = region_data.with_columns(
        pl.when((pl.col("date") == last) & (pl.col("tou_div") == "외국인"))
        .then(pl.lit(date(2025, 10, 5)))
        .otherwise(pl.col("available_at"))
        .alias("available_at"),
    )
    changed.write_parquet(paths.PROCESSED / "region_daily.parquet")
    result = client.get("/v1/baseline", params={"sigunguCode": "28110", "before": "2025-10-04"}).json()
    assert result["period"] == {"from": "2025-08-30", "to": "2025-09-26"}
    assert result["evidence"][0]["availableAt"] == "2025-09-27"


# 하루 전체나 한 집단이 빠졌을 때 모두 불완전한 주를 평균에 섞지 않는다.
@pytest.mark.parametrize("group", [None, "외국인"])
@pytest.mark.parametrize("missing,weeks", [(date(2025, 9, 30), 1), (date(2025, 9, 6), 4)])
def test_incomplete_window_moves_back_by_week(
    client: TestClient, region_data: pl.DataFrame, group: str | None, missing: date, weeks: int
) -> None:
    removed = pl.col("date") == missing
    if group:
        removed &= pl.col("tou_div") == group
    region_data.filter(~removed).write_parquet(paths.PROCESSED / "region_daily.parquet")
    response = client.get("/v1/baseline", params={"sigunguCode": "28110", "before": "2025-10-04"})
    assert response.status_code == 200, response.text
    last = date(2025, 10, 3) - timedelta(weeks=weeks)
    first = last - timedelta(days=27)
    result = response.json()
    assert result["period"] == {"from": first.isoformat(), "to": last.isoformat()}
    assert result["evidence"][0]["period"] == result["period"]
    for entry in result["weekdayMean"]:
        for field, visitor_group in (("local", "현지인"), ("nonlocal", "외지인"), ("foreign", "외국인")):
            values = [
                row["visitors"]
                for row in region_data.to_dicts()
                if row["sigungu_code"] == "28110"
                and first <= row["date"] <= last
                and row["date"].weekday() == entry["weekday"]
                and row["tou_div"] == visitor_group
            ]
            assert len(values) == 4
            assert entry[field] == pytest.approx(sum(values) / 4)


# 다섯 후보 창이 모두 불완전하면 더 오래된 완전 창이 있어도 조회 불가로 알린다.
def test_five_incomplete_windows_are_404(client: TestClient, region_data: pl.DataFrame) -> None:
    missing = [date(2025, 10, 2) - timedelta(weeks=week) for week in range(5)]
    region_data.filter(~pl.col("date").is_in(missing)).write_parquet(paths.PROCESSED / "region_daily.parquet")
    response = client.get("/v1/baseline", params={"sigunguCode": "28110", "before": "2025-10-04"})
    assert response.status_code == 404
    assert response.json()["code"] == "NO_COMPLETE_WINDOW"
    assert response.json()["message"]


# 공개 지연이 네 주보다 길어도 당시 공개된 최신 관측일부터 창을 잡는다.
def test_delayed_publication_uses_latest_observation(client: TestClient, region_data: pl.DataFrame) -> None:
    region_data.with_columns((pl.col("date") + pl.duration(days=35)).alias("available_at")).write_parquet(
        paths.PROCESSED / "region_daily.parquet",
    )
    response = client.get("/v1/baseline", params={"sigunguCode": "28110", "before": "2025-10-04"})
    assert response.status_code == 200
    assert response.json()["period"] == {"from": "2025-08-03", "to": "2025-08-30"}
    assert response.json()["evidence"][0]["availableAt"] == "2025-10-04"


# 공개된 날짜가 전혀 없으면 과거 창을 만들지 않는다.
def test_no_available_days_is_404(client: TestClient, region_data: pl.DataFrame) -> None:
    region_data.with_columns(pl.lit(date(2026, 1, 1)).alias("available_at")).write_parquet(
        paths.PROCESSED / "region_daily.parquet",
    )
    assert (
        client.get("/v1/baseline", params={"sigunguCode": "28110", "before": "2025-10-04"}).status_code == 404
    )


# 중복 일별 키는 정상 숫자로 합치지 않는다.
def test_duplicate_days_are_500(client: TestClient, region_data: pl.DataFrame) -> None:
    duplicate = region_data.filter(pl.col("date") == date(2025, 9, 20))
    pl.concat([region_data, duplicate]).write_parquet(paths.PROCESSED / "region_daily.parquet")
    assert (
        client.get("/v1/baseline", params={"sigunguCode": "28110", "before": "2025-10-04"}).status_code == 500
    )


# 결측 방문자 수를 평균의 분모에서 조용히 빼면 잘못된 평시가 되므로 거부한다.
def test_missing_visitors_are_500(client: TestClient, region_data: pl.DataFrame) -> None:
    region_data.with_columns(
        pl.when(pl.col("date") == date(2025, 9, 20))
        .then(None)
        .otherwise(pl.col("visitors"))
        .alias("visitors"),
    ).write_parquet(paths.PROCESSED / "region_daily.parquet")
    response = client.get("/v1/baseline", params={"sigunguCode": "28110", "before": "2025-10-04"})
    assert response.status_code == 500


# 일수·공개일이 충분해도 개편 지역의 칠월 관측은 한 건도 반환하지 않는다.
@pytest.mark.parametrize("code", ["28110", "28140", "28260"])
def test_region_break_cutoff(client: TestClient, region_data: pl.DataFrame, code: str) -> None:
    changed = region_data.filter(pl.col("sigungu_code") == "28110").with_columns(
        pl.lit(code).alias("sigungu_code"),
        (pl.col("date") + pl.duration(days=290)).alias("date"),
        (pl.col("available_at") + pl.duration(days=290)).alias("available_at"),
    )
    changed.write_parquet(paths.PROCESSED / "region_daily.parquet")
    rows = inputs.region_rows(code, date(2026, 7, 10))
    assert rows.height > 0
    assert rows["date"].max() == date(2026, 6, 30)
    response = client.get("/v1/baseline", params={"sigunguCode": code, "before": "2026-07-10"})
    assert response.status_code == 200
    assert response.json()["evidence"][0]["availableAt"] == "2026-07-01"


# 누락·깨진 날짜·코드 형식은 요청 오류로 구분한다.
@pytest.mark.parametrize(
    "query",
    [
        {},
        {"sigunguCode": "28110"},
        {"sigunguCode": "28110", "before": "2025-02-30"},
        {"sigunguCode": "28", "before": "2025-10-04"},
    ],
)
def test_baseline_invalid_request(client: TestClient, query: dict) -> None:
    assert client.get("/v1/baseline", params=query).status_code == 400
