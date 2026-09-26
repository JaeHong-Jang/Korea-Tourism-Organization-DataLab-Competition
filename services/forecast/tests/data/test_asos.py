"""ASOS 시간자료의 일강수 합산·관측소 좌표·호출 창·가까운 관측소 연결을 네트워크 없이 검증한다."""

from collections.abc import Callable
from datetime import date, timedelta

import httpx
import polars as pl
import pytest
from crowdcast.data.asos import collect, daily_totals, station_places, windows

ADMIN = pl.DataFrame({
    "sigungu_code": ["11110", "11140", "41110", "41111", "41610", "48820", "51820", "50110"],
    "sigungu_name": ["종로구", "중구", "수원시", "수원시 장안구", "광주시", "고성군", "고성군", "제주시"],
    "sido": ["서울특별시", "서울특별시", "경기도", "경기도", "경기도", "경상남도", "강원특별자치도",
             "제주특별자치도"],
    "parent_code": [None, None, None, "41110", None, None, None, None],
    "aliases": [["종로구"], ["중구"], ["수원", "수원시"], ["장안구"], ["광주", "광주시"], ["고성", "고성군"],
                ["고성", "고성군"], ["제주", "제주시"]],
    "lat": [37.59, 37.56, 37.28, 37.31, 37.41, 34.97, 38.38, 33.50],
    "lng": [126.98, 127.00, 127.01, 127.00, 127.26, 128.32, 128.47, 126.53],
})


# 하루치 시간자료를 만든다(tm은 01시~다음날 00시, 비는 지정한 시각에만).
def hours(day: date, rain: dict[int, str] | None = None, *, count: int = 24) -> list[dict]:
    rain = rain or {}
    start = day.toordinal()
    return [{"tm": f"{date.fromordinal(start + (hour + 1) // 24):%Y-%m-%d} {(hour + 1) % 24:02d}:00",
             "stnId": "108", "rn": rain.get(hour + 1, "")} for hour in range(count)]


# 00시 관측은 전날 강수로 합하고 24시간이 모자란 날은 빼며 빈 값의 결측 표시는 무강수로 센다.
def test_daily_totals_shift_and_completeness() -> None:
    day = date(2024, 6, 1)
    items = hours(day, {3: "1.5", 24: "0.4"}) + hours(day + timedelta(days=1), count=23)
    items[5]["rnQcflg"] = ""
    assert daily_totals(items) == {day: 1.9}
    flagged = hours(day, {5: "0.3"})
    flagged[0]["rnQcflg"] = "9"
    assert daily_totals(flagged) == {day: 0.3}


# 41일 안에 들어오는 행사만 한 호출 창으로 합친다.
def test_windows_merge_within_limit() -> None:
    spans = [(date(2024, 5, 1), date(2024, 5, 3)), (date(2024, 5, 30), date(2024, 6, 2)),
             (date(2024, 6, 20), date(2024, 6, 22))]
    assert windows(spans) == [(date(2024, 5, 1), date(2024, 6, 2)), (date(2024, 6, 20), date(2024, 6, 22))]


# 광역시 이름은 구 중심, 별칭은 소재 시군구, 두 곳 이상인 이름은 제외한다.
def test_station_places_metro_alias_and_ambiguous() -> None:
    places, skipped = station_places({108: "서울", 156: "광주", 119: "수원", 1: "고성", 184: "제주"}, ADMIN)
    assert places[108] == pytest.approx((37.575, 126.99))
    assert 156 not in places and 1 not in places and places[119] == (37.28, 127.01)
    assert places[184] == (33.50, 126.53)
    assert skipped == ["156 광주", "1 고성"]


# 행사 시군구마다 가장 가까운 관측소를 조회하고 40km 밖 행사는 세기만 한다.
def test_collect_links_nearest_station(datago_factory: Callable) -> None:
    requested: list[str] = []

    # 요청한 관측소 번호로 하루치 시간자료를 돌려준다.
    def respond(request: httpx.Request) -> httpx.Response:
        station = request.url.params["stnIds"]
        requested.append(station)
        items = [{**item, "stnId": station} for item in hours(date(2024, 6, 1), {12: "2.0"})]
        body = {"items": {"item": items}, "pageNo": 1, "numOfRows": 999, "totalCount": len(items)}
        return httpx.Response(200, json={"response": {"header": {"resultCode": "00"}, "body": body}})

    events = pl.DataFrame({
        "event_id": ["a", "b"], "sigungu_code": ["41111", "50110"],
        "start": [date(2024, 6, 1)] * 2, "end": [date(2024, 6, 1)] * 2,
    })
    frame, report = collect(datago_factory(respond=respond), events, ADMIN, {108: "서울", 119: "수원"})
    assert requested == ["119"]
    assert frame.to_dicts() == [{"sigungu_code": "41111", "date": date(2024, 6, 1), "precipitation_mm": 2.0,
                                 "station_id": 119, "station_name": "수원"}]
    assert report["40km 밖 행사"] == 1 and report["조회 창"] == 1
