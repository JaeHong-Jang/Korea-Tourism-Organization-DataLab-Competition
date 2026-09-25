"""실황·단기·중기·범위 밖 분기와 입력·출력 계약을 HTTP로 검증한다."""

from datetime import timedelta
from types import SimpleNamespace

import pytest
from crowdcast.api.contract import validate
from crowdcast.data.weather import service


# 경계값 앞뒤도 실제 HTTP 응답과 요청 상품으로 비교한다.
@pytest.mark.parametrize(
    "hours,source,calls,temp",
    [
        (-1.001, "없음", 0, None),
        (-1, "초단기실황", 1, 21.5),
        (0, "초단기실황", 1, 21.5),
        (1, "초단기실황", 1, 21.5),
        (1.001, "단기예보", 1, 11),
        (24, "단기예보", 1, 9),
        (72, "단기예보", 1, 9),
        (96, "중기예보", 2, None),
        (240, "중기예보", 2, None),
        (240.001, "없음", 0, None),
    ],
)
def test_products(
    weather_api: SimpleNamespace, hours: float, source: str, calls: int, temp: float | None
) -> None:
    target = weather_api.current + timedelta(hours=hours)
    response = weather_api.http.get(
        "/v1/weather", params={"lat": 37.57, "lng": 126.98, "at": target.isoformat()}
    )
    assert response.status_code == 200
    data = response.json()
    validate("weather", data)
    assert data["source"] == source
    assert data["temp"] == temp
    assert data["at"] == target.isoformat()
    assert len(weather_api.calls) == calls
    if source == "없음":
        assert all(data[key] is None for key in ("temp", "pop", "sky", "pty", "fetchedAt"))
    elif source == "초단기실황":
        assert (data["temp"], data["sky"], data["pop"], data["pty"]) == (21.5, None, None, "비")
    elif source == "단기예보":
        assert (data["sky"], data["pop"]) == ("흐림", 60)
    else:
        assert (data["temp"], data["pop"], data["sky"]) == (None, 40, "구름많음")
        assert [call.url.params["regId"] for call in weather_api.calls] == ["11B00000", "11B10101"]


# 시간대 표기가 달라도 같은 순간의 단기 예보를 선택한다.
@pytest.mark.parametrize("at,temp", [("2026-09-26T05:29:00Z", 14), ("2026-09-26t14:31:00+09:00", 15)])
def test_nearest_hour(weather_api: SimpleNamespace, at: str, temp: int) -> None:
    response = weather_api.http.get("/v1/weather", params={"lat": 37.57, "lng": 126.98, "at": at})
    assert response.status_code == 200
    assert response.json()["temp"] == temp
    validate("weather", response.json())


# 관측 전용 강수코드가 계약 밖 enum으로 새지 않게 한다.
@pytest.mark.parametrize("code,expected", [("0", "없음"), ("5", "비"), ("6", "비/눈"), ("7", "눈")])
def test_observed_precipitation(weather_api: SimpleNamespace, code: str, expected: str) -> None:
    weather_api.pty = code
    response = weather_api.http.get(
        "/v1/weather", params={"lat": 37.57, "lng": 126.98, "at": weather_api.current.isoformat()}
    )
    assert response.json()["pty"] == expected
    validate("weather", response.json())


# 중기 오후와 일 단위 예보는 같은 날짜라도 서로 다른 구간을 사용한다.
@pytest.mark.parametrize("days,hour,pop", [(6, 11, 40), (6, 12, 80), (8, 15, 40)])
def test_mid_period(weather_api: SimpleNamespace, days: int, hour: int, pop: int) -> None:
    target = (weather_api.current + timedelta(days=days)).replace(hour=hour)
    response = weather_api.http.get(
        "/v1/weather", params={"lat": 37.57, "lng": 126.98, "at": target.isoformat()}
    )
    assert response.json()["pop"] == pop
    assert response.json()["source"] == "중기예보"


# 상품 선택 경계에 중기 미제공 날짜가 걸리면 다른 날의 예보를 가져오지 않는다.
def test_mid_unpublished_period(weather_api: SimpleNamespace) -> None:
    target = weather_api.current + timedelta(days=3, seconds=1)
    response = weather_api.http.get(
        "/v1/weather", params={"lat": 37.57, "lng": 126.98, "at": target.isoformat()}
    )
    assert response.json()["source"] == "없음"


# 숫자·날짜 문법과 실제 지구 좌표 범위를 입구에서 검사하며 외부 호출을 하지 않는다.
@pytest.mark.parametrize(
    "change",
    [
        {"lat": "NaN"},
        {"lng": "inf"},
        {"lat": "text"},
        {"lat": 91},
        {"lng": -181},
        {"at": "2026-09-25"},
        {"at": "2026-09-25T09:30:00"},
        {"at": "2026-02-30T09:30:00+09:00"},
        {"at": ""},
    ],
)
def test_invalid_input(weather_api: SimpleNamespace, change: dict) -> None:
    query = {"lat": 37.57, "lng": 126.98, "at": weather_api.current.isoformat(), **change}
    assert weather_api.http.get("/v1/weather", params=query).status_code == 400
    assert weather_api.calls == []


# 필수 쿼리가 없으면 500 대신 입력 오류가 된다.
@pytest.mark.parametrize("field", ["lat", "lng", "at"])
def test_missing_input(weather_api: SimpleNamespace, field: str) -> None:
    query = {"lat": 37.57, "lng": 126.98, "at": weather_api.current.isoformat()}
    del query[field]
    assert weather_api.http.get("/v1/weather", params=query).status_code == 400


# 기상청 영역 밖 좌표나 중기 행정경계 자료가 없어도 화면에는 정보 없음으로 응답한다.
@pytest.mark.parametrize("missing_regions", [False, True])
def test_uncovered_location(
    weather_api: SimpleNamespace, monkeypatch: pytest.MonkeyPatch, missing_regions: bool
) -> None:
    monkeypatch.setattr(service, "weather_regions", lambda lat, lng: None)
    response = weather_api.http.get(
        "/v1/weather",
        params={
            "lat": 37.57 if missing_regions else 0,
            "lng": 126.98 if missing_regions else 0,
            "at": (weather_api.current + timedelta(days=6)).isoformat(),
        },
    )
    assert response.status_code == 200 and response.json()["source"] == "없음"
    assert weather_api.calls == []
