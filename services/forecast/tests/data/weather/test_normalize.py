"""결측·코드·자정·연장 예보와 잘못된 응답의 캐시 차단을 검증한다."""

from collections.abc import Callable

import httpx
import pytest
from crowdcast.data.datago_client import DataGoError


# 공식 단기 샘플의 요소만 바꾸어 수치·코드 경계값을 검증한다.
@pytest.mark.parametrize(
    "category,value,field,expected",
    [
        ("TMP", "-2.4", "temperature_c", -2.4),
        ("TMP", "-999", "temperature_c", None),
        ("TMP", "900", "temperature_c", None),
        ("POP", "0", "precipitation_probability_pct", 0),
        ("POP", "100", "precipitation_probability_pct", 100),
        ("SKY", "3", "sky", "구름많음"),
        ("SKY", "-999", "sky", None),
        ("PTY", "2", "precipitation_type", "비/눈"),
        ("PTY", None, "precipitation_type", None),
        ("WSD", "0", "wind_speed_m_s", 0),
    ],
)
def test_weather_values(
    weather_factory: Callable,
    weather_sample: Callable,
    category: str,
    value: str,
    field: str,
    expected: object,
) -> None:
    payload = weather_sample("short")
    payload["response"]["body"]["items"]["item"][0].update(category=category, fcstValue=value)
    result = weather_factory(respond=lambda _: httpx.Response(200, json=payload)).short_term(
        55, 127, "2021-06-28T05:00:00"
    )
    assert result["records"][0][field] == expected


# 숫자처럼 보이더라도 잘못된 값·시각·지역·발표회차는 캐시 전에 거절한다.
@pytest.mark.parametrize(
    "change",
    [
        {"fcstValue": "NaN"},
        {"fcstValue": "inf"},
        {"fcstValue": True},
        {"category": "POP", "fcstValue": "101"},
        {"category": "SKY", "fcstValue": "2"},
        {"category": "PTY", "fcstValue": "5"},
        {"category": "WSD", "fcstValue": "-1"},
        {"nx": 60},
        {"baseTime": "0200"},
        {"fcstDate": "20210627"},
        {"fcstTime": "2500"},
        {"fcstDate": "2021628"},
        {"category": []},
    ],
)
def test_bad_weather_not_cached(weather_factory: Callable, weather_sample: Callable, change: dict) -> None:
    payload = weather_sample("short")
    payload["response"]["body"]["items"]["item"][0].update(change)
    client = weather_factory(respond=lambda _: httpx.Response(200, json=payload))
    with pytest.raises(DataGoError):
        client.short_term(55, 127, "2021-06-28T05:00:00")
    assert not list(client.cache_dir.rglob("*.json"))


# 예보 원문의 2400은 다음 날짜로 정규화한다.
def test_midnight_2400(weather_factory: Callable, weather_sample: Callable) -> None:
    payload = weather_sample("short")
    payload["response"]["body"]["items"]["item"][0]["fcstTime"] = "2400"
    result = weather_factory(respond=lambda _: httpx.Response(200, json=payload)).short_term(
        55, 127, "2021-06-28T05:00:00"
    )
    assert result["records"][0]["valid_at"] == "2021-06-29T00:00:00+09:00"


# 연장기간의 WSD=2는 2m/s가 아니라 약간 강한 바람이라는 코드다.
@pytest.mark.parametrize("hour,day,extended", [(5, 28, True), (17, 28, False), (17, 29, True)])
def test_extended_wind(
    weather_factory: Callable, weather_sample: Callable, hour: int, day: int, extended: bool
) -> None:
    payload = weather_sample("short")
    payload["response"]["body"]["items"]["item"][0].update(
        baseDate="20260925",
        baseTime=f"{hour:02}00",
        fcstDate=f"202609{day}",
        fcstTime="0300",
        category="WSD",
        fcstValue="2",
    )
    result = weather_factory(respond=lambda _: httpx.Response(200, json=payload)).short_term(
        55, 127, f"2026-09-25T{hour:02}:00:00"
    )
    record = result["records"][0]
    assert record["wind_speed_category"] == ("약간 강한 바람" if extended else None)
    assert record["wind_speed_m_s"] == (None if extended else 2)


# 중기 복합 문구를 분리하고 오후 발표에서 제공하지 않는 4일차는 제외한다.
@pytest.mark.parametrize("hour,first_day", [(6, "29"), (18, "30")])
def test_mid_land_periods(
    weather_factory: Callable, weather_sample: Callable, hour: int, first_day: str
) -> None:
    payload = weather_sample("mid_land")
    item = payload["response"]["body"]["items"]["item"][0]
    item.update(rnSt4Am=80, wf4Am="흐리고 비/눈", rnSt5Am=70, wf5Am="구름많고 소나기")
    result = weather_factory(respond=lambda _: httpx.Response(200, json=payload)).mid_term(
        "11B00000", f"2026-09-25T{hour:02}:00:00"
    )
    record = result["records"][0]
    assert record["valid_at"] == f"2026-09-{first_day}T00:00:00+09:00"
    assert record["sky"] == ("흐림" if hour == 6 else "구름많음")
    assert record["precipitation_type"] == ("비/눈" if hour == 6 else "소나기")


# 다른 구역과 알 수 없는 날씨 문구를 중기 응답으로 확정하지 않는다.
@pytest.mark.parametrize("change", [{"regId": "11D10000"}, {"wf5Am": "알 수 없는 날씨"}, {"rnSt5Am": -1}])
def test_bad_mid_land(weather_factory: Callable, weather_sample: Callable, change: dict) -> None:
    payload = weather_sample("mid_land")
    payload["response"]["body"]["items"]["item"][0].update(change)
    client = weather_factory(respond=lambda _: httpx.Response(200, json=payload))
    with pytest.raises(DataGoError):
        client.mid_term("11B00000", "2026-09-25T06:00:00")
    assert not list(client.cache_dir.rglob("*.json"))
