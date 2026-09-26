"""실제 모델의 단건·일괄 예보 바이트 일치와 평시·관측 부재 처리를 검증한다."""

import json
from datetime import date, timedelta
from pathlib import Path

import polars as pl
import pytest
from crowdcast import paths
from crowdcast.analytics.upcoming import run_batch
from crowdcast.api.assemble.identity import canonical
from crowdcast.api.assemble.inputs import cutoff, korean_date
from crowdcast.api.contract import validate
from crowdcast.data.events import contract_event
from crowdcast.data.weather import service
from crowdcast.data.weather.normalize import as_kst
from fastapi.testclient import TestClient


# 단건 계약 행사와 같은 정보를 마스터에 넣어 계약 변환부터 실제 배치를 실행한다.
@pytest.fixture
def upcoming_event(forecast_data: Path, event: dict) -> dict:
    row = {
        "event_id": event["id"], "name": event["name"], "type": event["type"],
        "start": korean_date(event["startsAt"]), "end": korean_date(event["endsAt"]),
        "year": 2025, "time_of_day": None, "sido": event["sido"], "sigungu_code": event["sigunguCode"],
        "sigungu_name": event["sigunguName"], "lat": event["venue"]["lat"], "lng": event["venue"]["lng"],
        "venue": event["venue"]["name"], "fee": event["fee"], "host_type": event["hostType"],
        "budget_krw": event["budgetKrw"], "edition": event["edition"], "hazard_flags": event["hazards"],
        "source": ["문체부"], "is_golden": False,
        "date_source": "TourAPI", "date_available_at": event["startsAt"],
    }
    existing = pl.read_parquet(paths.PROCESSED / "events.parquet")
    pl.concat([existing, pl.DataFrame([row])], how="diagonal_relaxed").write_parquet(
        paths.PROCESSED / "events.parquet"
    )
    return contract_event(row)


# 평시 창이 없더라도 조립기가 생략한 근거만 표시하고 같은 예보를 저장한다.
@pytest.mark.parametrize("complete_baseline", [True, False])
def test_batch_predict_identical_bytes(
    client: TestClient, upcoming_event: dict, complete_baseline: bool,
) -> None:
    if not complete_baseline:
        frame = pl.read_parquet(paths.PROCESSED / "region_daily.parquet")
        frame.filter(
            (pl.col("sigungu_code") == upcoming_event["sigunguCode"])
            & (pl.col("available_at") <= cutoff(upcoming_event))
        ).tail(3).write_parquet(paths.PROCESSED / "region_daily.parquet")
        baseline = client.get("/v1/baseline", params={
            "sigunguCode": upcoming_event["sigunguCode"], "before": cutoff(upcoming_event).isoformat(),
        })
        assert baseline.status_code == 404 and baseline.json()["code"] == "NO_COMPLETE_WINDOW"
    day = korean_date(upcoming_event["startsAt"])
    report = run_batch(day, day)
    response = client.post("/v1/predict", json=upcoming_event)
    assert response.status_code == 200, response.text
    content = (paths.PROCESSED / "upcoming_forecasts.jsonl").read_bytes()
    stored = json.loads(content)
    validate("forecast", stored["forecast"])
    assert canonical(stored["forecast"]).encode() == response.content
    summary = pl.read_parquet(paths.PROCESSED / "upcoming.parquet").row(0, named=True)
    assert summary["modelVersion"] == "v0.1.0"
    assert summary["modelVerdict"] == "미검증"
    assert summary["baselineAvailable"] is complete_baseline
    assert summary["runId"] == stored["runId"]
    assert f"runId: {stored['runId']}" in report
    assert "일정 공개일이 asOf 뒤인 행사 1건(입력으로 사용 — 06 §3)" in report
    selected = client.get(f"/v1/festivals/upcoming/{upcoming_event['id']}/event")
    assert selected.status_code == 200
    assert selected.json() == upcoming_event
    listing = client.get("/v1/festivals/upcoming")
    assert listing.headers["x-run-id"] == stored["runId"]
    assert f"평시 근거 없음: {int(not complete_baseline)}" in report
    assert "예보 수: 1" in report
    before = (paths.PROCESSED / "upcoming.parquet").read_bytes()
    run_batch(day, day)
    assert (paths.PROCESSED / "upcoming.parquet").read_bytes() == before
    assert (paths.PROCESSED / "upcoming_forecasts.jsonl").read_bytes() == content


# 공개 관측이 없어지면 503 사유로 집계하며 직전 정상 예보를 최신 결과로 재사용하지 않는다.
def test_batch_no_observation(client: TestClient, upcoming_event: dict) -> None:
    day = korean_date(upcoming_event["startsAt"])
    run_batch(day, day)
    for name in ("labels", "region_daily"):
        path = paths.PROCESSED / f"{name}.parquet"
        pl.read_parquet(path).with_columns(pl.lit(date(2099, 1, 1)).alias("available_at")).write_parquet(path)
    report = run_batch(day, day)
    response = client.post("/v1/predict", json=upcoming_event)
    assert response.status_code == 503
    assert response.json()["code"] == "NO_OBSERVATION"
    assert "503 NO_OBSERVATION: 1" in report and "예보 수: 0" in report
    assert pl.read_parquet(paths.PROCESSED / "upcoming.parquet").is_empty()
    assert (paths.PROCESSED / "upcoming_forecasts.jsonl").read_bytes() == b""
    listing = client.get("/v1/festivals/upcoming")
    assert listing.json() == []
    assert f"runId: {listing.headers['x-run-id']}" in report


# 임박한 행사도 일괄 예보와 사전 등록 원본 생성에서는 날씨 서비스를 호출하지 않는다.
def test_nearby_batch_never_calls_weather(upcoming_event: dict, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(service, "now", lambda: as_kst(upcoming_event["startsAt"]) - timedelta(days=7))

    # 배치가 날씨 경로로 들어가면 성공 대체 없이 바로 테스트를 실패시킨다.
    def forbidden(*args: object, **kwargs: object) -> None:
        pytest.fail("일괄·사전 등록 예보는 날씨를 조회하면 안 됩니다")

    monkeypatch.setattr(service, "weather", forbidden)
    day = korean_date(upcoming_event["startsAt"])
    run_batch(day, day)
    stored = json.loads((paths.PROCESSED / "upcoming_forecasts.jsonl").read_bytes())["forecast"]
    assert not any((item["source"] or {}).get("publisher") == "기상청" for item in stored["evidence"])
    before = canonical(stored)
    run_batch(day, day)
    after = json.loads((paths.PROCESSED / "upcoming_forecasts.jsonl").read_bytes())["forecast"]
    assert canonical(after) == before
