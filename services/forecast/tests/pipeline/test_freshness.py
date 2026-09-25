"""최신성의 지연 경계·실제 수집 시각·보유 연도·배치 식별자와 승격 모델을 검증한다."""

import json
import os
from datetime import date, datetime, timedelta
from pathlib import Path

import polars as pl
import pytest
from crowdcast import paths
from crowdcast.api.assemble.http import endpoint_validator
from crowdcast.pipeline import freshness, run_record, stages

TODAY = date(2026, 9, 25)
COLLECTED = "2026-09-24T09:00:00+09:00"


# 실제 수집기와 동일한 페이지 봉투를 격리 캐시에 기록한다.
def cached(api: str, items: list[dict], stamp: str = COLLECTED, name: str = "cache") -> Path:
    folder = paths.CACHE / "datago" / api
    folder.mkdir(parents=True, exist_ok=True)
    payload = {
        "response": {
            "header": {"resultCode": "00"},
            "body": {"items": {"item": items}, "totalCount": len(items), "pageNo": 1, "numOfRows": 1000},
        }
    }
    file = folder / (name + ".json")
    file.write_text(json.dumps({"fetched_at": stamp, "payload": payload}))
    return file


# 임계값 당일은 정상이고 하루 초과부터 경고하며 수집 시각과 관측일을 구분한다.
@pytest.mark.parametrize("lag,warning", [(35, False), (36, True), (-1, True)])
def test_visitor_lag_boundary(pipeline_root: Path, lag: int, warning: bool) -> None:
    observed = TODAY - timedelta(days=lag)
    pl.DataFrame({"date": [observed, observed]}).write_parquet(paths.PROCESSED / "region_daily.parquet")
    cached("visitors", [{"baseYmd": "20260821"}])
    cached("visitors", [], "2026-09-25T12:00:00+09:00", "empty")
    value = freshness.visitors(TODAY)
    assert value["lastObservedDate"] == observed.isoformat()
    assert value["lastCollectedAt"] == COLLECTED and value["rows"] == 2
    assert f"{lag}일" in value["title"] and ("경고" in value["title"]) == warning


# 수정 시각이 더 새로워도 캐시 본문의 실제 수집 시각을 선택하고 파손 캐시는 무시한다.
def test_cache_times_weather_and_holiday_years(pipeline_root: Path) -> None:
    cached("festivals", [], "2026-09-24T10:00:00+09:00")
    cached("places", [{"contentid": "인천"}], "2026-09-24T02:00:00+00:00")
    holiday = cached("holidays", [{"locdate": "20261003"}, {"locdate": "20250101"}])
    (holiday.parent / "broken.json").write_bytes(b"bad")
    envelope = json.loads(holiday.read_bytes())
    folder = paths.CACHE / "weather/short_term"
    folder.mkdir(parents=True)
    (folder / "weather.json").write_text(
        json.dumps({"fetched_at": COLLECTED, "payloads": [envelope["payload"]]})
    )
    values = {row["datasetId"]: row for row in freshness.freshness(TODAY)}
    assert values["ds-kto-tourapi-15101578"]["lastCollectedAt"] == "2026-09-24T11:00:00+09:00"
    assert values["ds-weather"]["lastCollectedAt"] == COLLECTED
    assert "2025, 2026" in values["ds-kasi-holidays-15012690"]["title"]
    endpoint_validator("/v1/ops/freshness", "response").validate(list(values.values()))


# 일괄 예보가 비어도 실행 ID를 유지하고 후보 모델보다 승격 모델을 우선한다.
def test_empty_batch_and_promoted_model(pipeline_root: Path) -> None:
    file = paths.PROCESSED / "upcoming.parquet"
    pl.DataFrame(schema={"runId": pl.String}).write_parquet(file, metadata={"runId": "batch-incheon-2026"})
    timestamp = datetime.fromisoformat(COLLECTED).timestamp()
    os.utime(file, (timestamp, timestamp))
    folder = paths.REPORTS / "backtest"
    folder.mkdir()
    for name, version in (("promoted", "v0.1.0"), ("latest", "v0.2.0")):
        (folder / f"{name}.json").write_text(
            json.dumps({"modelVersion": version, "promotedAt": COLLECTED, "verdict": "미검증"})
        )
    values = {row["datasetId"]: row for row in freshness.freshness(TODAY)}
    batch = values["ds-upcoming"]
    assert "batch-incheon-2026" in batch["title"] and "추정" in batch["title"]
    assert batch["lastCollectedAt"] == COLLECTED and batch["rows"] == 0
    assert "v0.1.0" in values["ds-promoted-model"]["title"]
    assert "미검증" in values["ds-promoted-model"]["title"]


# 캐시가 정리되어도 fetch에 저장한 마지막 실제 수집 성공 시각을 이어받는다.
def test_fetch_history_retains_success_time(pipeline_root: Path) -> None:
    record = run_record.new_record(stages.STAGES, ("fetch",), False)
    record["stages"][0]["status"] = "passed"
    record["stages"][0]["gate"] = {
        "passed": True,
        "message": "캐시만"
        + run_record.FETCH_STATE_MARKER
        + json.dumps({"latest": "2026-08-21", "last_success": COLLECTED}),
    }
    run_record.finish_record(record, False, ("fetch",))
    run_record.write_record(record)
    assert freshness.visitors(TODAY)["lastCollectedAt"] == COLLECTED


# 손상한 자료 하나 때문에 운영 상태 전체가 실패하지 않고 해당 행만 경고한다.
def test_corrupt_dataset_keeps_other_rows(pipeline_root: Path) -> None:
    (paths.PROCESSED / "region_daily.parquet").write_bytes(b"broken")
    values = freshness.freshness(TODAY)
    assert values[0]["rows"] is None and "자료 오류" in values[0]["title"]
    assert values[2]["lastCollectedAt"] is None and len(values) == 6
