"""평시 결측과 유사 순위 밖 전회차도 예보 근거에 정확히 반영되는지 검사한다."""

import json
from datetime import date
from pathlib import Path

import polars as pl
import pytest
from crowdcast import paths
from fastapi.testclient import TestClient


# 유사 사례가 여섯 건 동점이어도 최근 전회차 근거와 단위를 누락하지 않는다.
def test_previous_case_outside_top_five(client: TestClient, forecast_data: Path, event: dict) -> None:
    labels = pl.read_parquet(paths.PROCESSED / "labels.parquet").with_columns(
        pl.lit(True).alias("is_primary")
    )
    labels.write_parquet(paths.PROCESSED / "labels.parquet")
    # 전회차가 동점 순위 밖이어도 조회 결과는 상위 네 건 + 전회차 다섯 건이다(예보 사례 근거와 같은 목록).
    similar = client.post("/v1/similar", json=event).json()
    assert len(similar) == 5
    assert "e-yeongjong-fireworks-2024" in {row["eventId"] for row in similar}
    response = client.post("/v1/predict", json=event)
    assert response.status_code == 200, response.text
    result = response.json()
    cases = [row for row in result["evidence"] if row["kind"] == "case"]
    assert len(cases) == 5
    assert {row["caseEventId"] for row in cases} == {row["eventId"] for row in similar}
    previous = next(row for row in cases if row["caseEventId"] == "e-yeongjong-fireworks-2024")
    measured = json.loads(previous["summary"])["quantities"][0]
    observed = next(row for row in result["observations"] if row["datasetId"] == "ds-datalab-festival-status")
    assert measured["value"] == observed["value"]
    assert measured["unit"] == observed["unit"]
    assert previous["availableAt"] == observed["availableAt"]
    assert previous["period"]["to"] == observed["observedAt"]
    assert all(row["evidence"][0] in cases for row in similar)
    assert response.content == client.post("/v1/predict", json=event).content


# 전회차가 상위 다섯 건에 이미 있으면 같은 근거를 중복 발행하지 않는다.
def test_previous_case_is_not_duplicated(client: TestClient, forecast_data: Path, event: dict) -> None:
    result = client.post("/v1/predict", json=event).json()
    cases = [row for row in result["evidence"] if row["kind"] == "case"]
    assert len(cases) == 5
    assert sum(row["caseEventId"] == "e-yeongjong-fireworks-2024" for row in cases) == 1


# 예보의 평시와 구성비도 조회 API가 고른 완전한 창만 재사용한다.
@pytest.mark.parametrize("missing,available", [(date(2025, 9, 30), True), (date(2025, 9, 4), False)])
def test_forecast_uses_complete_baseline(
    client: TestClient, forecast_data: Path, event: dict, missing: date, available: bool
) -> None:
    frame = pl.read_parquet(paths.PROCESSED / "region_daily.parquet")
    frame.filter(~pl.col("date").is_in([missing, date(2025, 9, 30)])).write_parquet(
        paths.PROCESSED / "region_daily.parquet"
    )
    response = client.post("/v1/predict", json=event)
    assert response.status_code == 200, response.text
    result = response.json()
    baseline = client.get("/v1/baseline", params={"sigunguCode": "28110", "before": result["asOf"]})
    evidence = [row for row in result["evidence"] if row["title"] == "개최지 평시 방문"]
    if available:
        assert baseline.status_code == 200
        assert evidence == baseline.json()["evidence"]
        assert evidence[0]["period"] == {"from": "2025-08-30", "to": "2025-09-26"}
        assert result["composition"]["nonlocal"] == pytest.approx(baseline.json()["nonlocalShare"])
    else:
        assert baseline.status_code == 404
        assert evidence == []
        assert result["composition"] is None
