"""합성 지역 자료로 네 채점 상태·실버 함수 일치·환산 등급·응답 계약을 확인한다."""

import asyncio
from collections.abc import Callable
from copy import deepcopy
from datetime import date, timedelta
from typing import Any

import httpx
import polars as pl
import pytest
from crowdcast.api.app import app
from crowdcast.api.assemble import http
from crowdcast.api.contract import validate
from crowdcast.api.routes import preregistration
from crowdcast.labels import silver
from crowdcast.models.distribution import distribution
from crowdcast.scoring import rules
from crowdcast.scoring.register import prepare
from crowdcast.scoring.score import actual_status, score_entries, silver_event
from crowdcast.scoring.select import select_festivals
from scoring_fixtures import daily_rows, inputs, ledger


# 한글날 전 네 금요일 중 추석을 제외한 세 표본의 중앙값 100·표준편차 10을 만든다.
def observations(value: float, code: str = "41800", *, missing: bool = False) -> pl.DataFrame:
    start = date(2026, 10, 9)
    values = {start - timedelta(days=7): 90, start - timedelta(days=14): 99999,
              start - timedelta(days=21): 100, start - timedelta(days=28): 110}
    if not missing:
        values[start] = value
    return daily_rows(values, code)


# 완료·대기·저신호·취소를 함께 반환하고 완료 한 건만 포함률 분모로 센다.
def test_four_statuses_and_same_silver() -> None:
    batch, masters, baseline = inputs([1] * 4)
    selection = select_festivals(batch, masters, baseline)
    preparation = prepare(batch, selection)
    frames, statuses = [], []
    for pos, summary in enumerate(preparation["summaries"]):
        event_id = summary["eventId"]
        code = ("41800", "41480", "41150", "48170")[pos]
        preparation["events"][event_id]["sigunguCode"] = code
        frames.append(observations(200 if pos != 2 else 101, code, missing=pos == 1))
        preparation["payloads"][pos]["forecast"].update(dailyMeanP10=50, dailyMeanP50=100, dailyMeanP90=150)
        if pos == 3:
            statuses.append({"eventId": event_id, "status": "취소", "source": "연천군 축제 공지",
                             "checkedAt": "2026-10-08T12:00:00+09:00"})
    entries = ledger(preparation["payloads"])
    region = pl.concat(frames)
    result = score_entries(entries, preparation, region, statuses)
    assert [r["status"] for r in result["entries"]] == ["채점 완료", "대기", "채점 불가", "취소"]
    assert result["summary"] == {
        "registered": 4, "scored": 1, "inInterval": 1, "unscorable": 1, "cancelled": 1}
    event = preparation["events"][entries[0]["eventId"]]
    labels, _ = silver.build_silver([silver_event(event)], region, "region_daily.parquet")
    assert result["entries"][0]["actual"]["value"] == labels[0]["daily_mean"] == 100
    _, judgment = distribution([100] * 3, event, seed=2026, n=4000, basis="구간")
    expected_level = entries[0]["forecast"]["level"] == judgment.judgment["level"]
    assert result["entries"][0]["levelMatch"] == expected_level
    assert all(r["inInterval"] is None and r["actual"] is None for r in result["entries"][1:])
    validate("preregistration-scores", result)


# 경계 3σ는 불가이고 경계 바로 위 값은 반올림 없이 T-103과 같아야 한다.
@pytest.mark.parametrize(("value", "status"), [(130, "채점 불가"), (130.01, "채점 완료"), (90, "채점 불가")])
def test_signal_boundary(value: float, status: str) -> None:
    batch, masters, region = inputs([1])
    event = next(iter(select_festivals(batch, masters, region)["events"].values()))
    observed, quantity = actual_status(event, observations(value))
    assert observed == status
    if quantity:
        assert quantity["value"] == value - 100


# 누락된 세 방문자 구분은 대기이며 행사 뒤 관측을 추가해도 실버 값은 바뀌지 않는다.
def test_missing_group_and_no_post_event_leakage() -> None:
    batch, masters, region = inputs([1])
    event = next(iter(select_festivals(batch, masters, region)["events"].values()))
    frame = observations(200)
    incomplete = frame.filter(~((pl.col("date") == date(2026, 10, 9)) & (pl.col("tou_div") == "외국인")))
    assert actual_status(event, incomplete)[0] == "대기"
    future = daily_rows({date(2026, 10, 10): 99999999})
    assert actual_status(event, frame) == actual_status(event, pl.concat([frame, future]))


# 등록 당시 설정·본문이 바뀌면 채점 결과를 내지 않는다.
def test_changed_conversion_and_ledger() -> None:
    batch, masters, region = inputs([1])
    preparation = prepare(batch, select_festivals(batch, masters, region))
    entries = ledger(preparation["payloads"])
    changed = deepcopy(preparation)
    changed["metadata"]["conversion"]["settings"]["peak"] = {}
    with pytest.raises(ValueError, match="환산·판정"):
        score_entries(entries, changed, observations(200), [])
    changed = deepcopy(preparation)
    changed["payloads"][0]["leadDays"] += 1
    with pytest.raises(ValueError, match="본문·등록일"):
        score_entries(entries, changed, observations(200), [])


# API 라우트는 서비스 결과를 실제 OpenAPI 계약으로 검증해 전달한다.
def test_api_routes(monkeypatch: pytest.MonkeyPatch) -> None:
    batch, masters, region = inputs([1])
    selection = select_festivals(batch, masters, region)
    preparation = prepare(batch, selection)
    result = score_entries(ledger(preparation["payloads"]), preparation, observations(200), [])
    monkeypatch.setattr(preregistration, "load_selection", lambda: (batch, selection))
    monkeypatch.setattr(preregistration, "scores", lambda: result)

    # 라우트 단위 테스트는 스레드 실행기만 대체하고 응답 계산·정본 검증은 그대로 통과한다.
    async def inline(function: Callable[[], Any]) -> Any:
        return function()

    monkeypatch.setattr(http, "run_in_threadpool", inline)

    # 별도 서버나 TestClient 포털 없이 실제 ASGI 앱을 직접 호출한다.
    async def request_routes() -> None:
        async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://forecast.test") as client:
            response = await asyncio.wait_for(client.post("/v1/preregistration/select"), timeout=5)
            assert response.status_code == 200 and response.json() == selection["summaries"]
            response = await asyncio.wait_for(client.get("/v1/preregistration/scores"), timeout=5)
            assert response.status_code == 200 and response.json() == result

    asyncio.run(request_routes())
    assert result["tag"] == rules.TAG and result["rulesDoc"] == rules.RULES_DOC


# records 실패를 빈 원장이나 성공 채점으로 숨기지 않는다.
def test_records_failure() -> None:
    from crowdcast.api.assemble.artifacts import Unavailable
    from crowdcast.scoring.score import scores

    with httpx.Client(base_url="http://records.test", transport=httpx.MockTransport(
            lambda request: httpx.Response(503))) as client:
        with pytest.raises(Unavailable):
            scores(client)


# 등록 전의 빈 원장은 아직 준비본·관측 파일이 없어도 0건으로 공개한다.
def test_empty_ledger_before_registration() -> None:
    from crowdcast.scoring.score import scores

    with httpx.Client(base_url="http://records.test", transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json=[]))) as client:
        result = scores(client)
    assert result["entries"] == [] and result["summary"]["registered"] == 0


# 포함 구간은 양끝을 포함하며 작은 차이를 표시 반올림으로 덮지 않는다.
@pytest.mark.parametrize(("value", "included"), [(150, True), (250, True), (250.001, False)])
def test_interval_endpoints(value: float, included: bool) -> None:
    batch, masters, region = inputs([1])
    preparation = prepare(batch, select_festivals(batch, masters, region))
    preparation["payloads"][0]["forecast"].update(dailyMeanP10=50, dailyMeanP50=100, dailyMeanP90=150)
    result = score_entries(ledger(preparation["payloads"]), preparation, observations(value), [])
    assert result["entries"][0]["inInterval"] is included


# 행사 전 기준선이 부족하거나 표준편차가 0이면 자료가 다 있어도 채점 불가다.
@pytest.mark.parametrize("fault", ["short", "zero"])
def test_invalid_scoring_baseline(fault: str) -> None:
    batch, masters, region = inputs([1])
    event = next(iter(select_festivals(batch, masters, region)["events"].values()))
    frame = observations(200)
    if fault == "short":
        frame = frame.filter(pl.col("date") != date(2026, 9, 11))
    else:
        frame = frame.with_columns(pl.when((pl.col("date") < date(2026, 10, 9))
                                           & (pl.col("tou_div") == "현지인"))
                                   .then(100.0).otherwise(pl.col("visitors")).alias("visitors"))
    assert actual_status(event, frame) == ("채점 불가", None)
