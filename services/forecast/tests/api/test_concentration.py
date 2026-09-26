"""관광지 집중률 요약의 행사 기간 평균·예측 범위 밖·수집 실패 응답을 계약과 함께 확인한다."""

from datetime import date

import pytest
from crowdcast.analytics.concentration import summarize
from crowdcast.api.app import app
from crowdcast.api.routes import concentration
from fastapi.testclient import TestClient


# 두 관광지 × 사흘 예측(집중률은 문자열로 온다)과 날짜가 깨진 행 하나.
def rows() -> list[dict]:
    values = {
        ("가", "20261001"): "40",
        ("가", "20261002"): "60",
        ("가", "20261003"): "20",
        ("나", "20261001"): "80",
        ("나", "20261002"): "100",
        ("나", "20261003"): "10",
    }
    items = [
        {"tAtsNm": name, "baseYmd": day, "cnctrRate": rate, "available_at": "2026-09-26T01:00:00+00:00"}
        for (name, day), rate in values.items()
    ]
    return [*items, {"tAtsNm": "다", "baseYmd": "없음", "cnctrRate": "50"}]


# 행사 이틀(10/1~10/2)만 평균하고 붐비는 관광지 순서로 줄 세운다.
def test_summarize_event_days() -> None:
    result = summarize("11680", date(2026, 10, 1), date(2026, 10, 2), rows())
    assert result["status"] == "ok"
    assert result["attractions"] == 2
    assert result["eventMean"] == 70.0
    assert result["windowMean"] == 51.7
    assert result["days"] == [
        {"date": "2026-10-01", "mean": 60.0, "max": 80.0},
        {"date": "2026-10-02", "mean": 80.0, "max": 100.0},
    ]
    assert result["top"] == [{"name": "나", "rate": 90.0}, {"name": "가", "rate": 50.0}]
    assert (result["windowFrom"], result["windowTo"]) == ("2026-10-01", "2026-10-03")


# 행사일이 예측 범위 밖이면 평균을 지어내지 않고, 예측이 없으면 비었다고 알린다.
def test_summarize_out_of_window_and_empty() -> None:
    later = summarize("11680", date(2026, 12, 1), date(2026, 12, 3), rows())
    assert (later["status"], later["eventMean"], later["days"], later["top"]) == (
        "out_of_window",
        None,
        [],
        [],
    )
    assert later["windowMean"] == 51.7
    empty = summarize("11680", date(2026, 10, 1), date(2026, 10, 2), [])
    assert (empty["status"], empty["attractions"], empty["fetchedAt"]) == ("empty", 0, None)


# 라우트는 입력을 검사하고 계약에 맞는 요약을, 수집 실패는 503을 돌려준다.
def test_route_contract_and_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(concentration, "collect", lambda code: rows())
    with TestClient(app) as client:
        ok = client.get(
            "/v1/concentration", params={"sigunguCode": "11680", "from": "2026-10-01", "to": "2026-10-02"}
        )
        bad = client.get(
            "/v1/concentration", params={"sigunguCode": "강남", "from": "2026-10-01", "to": "2026-10-02"}
        )
        reversed_dates = client.get(
            "/v1/concentration", params={"sigunguCode": "11680", "from": "2026-10-03", "to": "2026-10-01"}
        )
    assert ok.status_code == 200 and ok.json()["eventMean"] == 70.0
    assert bad.status_code == 400 and reversed_dates.status_code == 400

    def fail(code: str) -> list[dict]:
        raise concentration.Unavailable("관광지 집중률 예측을 지금 받아 오지 못했어요")

    monkeypatch.setattr(concentration, "collect", fail)
    with TestClient(app) as client:
        down = client.get(
            "/v1/concentration", params={"sigunguCode": "11680", "from": "2026-10-01", "to": "2026-10-02"}
        )
    assert down.status_code == 503
