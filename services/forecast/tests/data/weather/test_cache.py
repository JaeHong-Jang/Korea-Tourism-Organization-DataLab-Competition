"""천 행 초과 예보의 전체 페이지 수집과 원자적 캐시·중복 요청 잠금을 검증한다."""

import json
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from threading import Barrier

import httpx
import pytest
from crowdcast.data.datago_client import DataGoError


# 공식 단기 샘플의 봉투에 84시간·14요소를 넣어 실제 천 행 경계를 넘긴다.
@pytest.fixture
def paginated_weather(weather_sample: Callable) -> tuple[list[dict], Callable]:
    template = weather_sample("short")
    categories = {
        "TMP": "21",
        "UUU": "1",
        "VVV": "1",
        "VEC": "45",
        "WSD": "1.4",
        "SKY": "1",
        "PTY": "0",
        "POP": "0",
        "PCP": "강수없음",
        "REH": "65",
        "SNO": "적설없음",
        "WAV": "0",
        "TMN": "18",
        "TMX": "26",
    }
    rows = []
    for offset in range(84):
        valid = datetime(2021, 6, 28, 6) + timedelta(hours=offset)
        for category, value in categories.items():
            rows.append(
                {
                    "baseDate": "20210628",
                    "baseTime": "0500",
                    "nx": 55,
                    "ny": 127,
                    "fcstDate": valid.strftime("%Y%m%d"),
                    "fcstTime": valid.strftime("%H%M"),
                    "category": category,
                    "fcstValue": value,
                }
            )

    # 요청 페이지에 해당하는 행만 돌려줘 두 번째 요청이 반드시 필요하게 한다.
    def respond(request: httpx.Request) -> httpx.Response:
        payload = json.loads(json.dumps(template))
        page = int(request.url.params["pageNo"])
        payload["response"]["body"].update(
            items={"item": rows[(page - 1) * 1000 : page * 1000]}, pageNo=page, totalCount=len(rows)
        )
        return httpx.Response(200, json=payload)

    return rows, respond


# 페이지 경계에서 끊긴 시각의 요소까지 합쳐 정렬하고 재조회는 호출하지 않는다.
def test_all_pages_and_cache(weather_factory: Callable, paginated_weather: tuple) -> None:
    _, respond = paginated_weather
    client = weather_factory(respond=respond)
    result = client.short_term(55, 127, "2021-06-28T05:00:00")
    assert len(result["records"]) == 84
    assert result["records"][71]["temperature_c"] == 21
    assert result["records"][71]["precipitation_probability_pct"] == 0
    assert result["records"][-1]["valid_at"] == "2021-07-01T17:00:00+09:00"
    assert client.ledger.calls == 2
    assert weather_factory(max_calls=0).short_term(55, 127, "2021-06-28T05:00:00") == result
    assert len(list(client.cache_dir.rglob("*.json"))) == 1


# 두 번째 페이지의 중복·누락·전체 행 수 변화는 부분 성공 캐시를 남기지 않는다.
@pytest.mark.parametrize("fault", ["duplicate", "truncated", "changed_total", "wrong_page"])
def test_bad_second_page(weather_factory: Callable, paginated_weather: tuple, fault: str) -> None:
    rows, original = paginated_weather

    # 첫 페이지를 정상 처리한 뒤 두 번째 페이지만 손상시킨다.
    def respond(request: httpx.Request) -> httpx.Response:
        payload = original(request).json()
        if int(request.url.params["pageNo"]) == 2:
            body = payload["response"]["body"]
            if fault == "duplicate":
                body["items"]["item"][0] = rows[0]
            elif fault == "truncated":
                body["items"]["item"].pop()
            elif fault == "changed_total":
                body["totalCount"] += 1
            else:
                body["pageNo"] = 1
        return httpx.Response(200, json=payload)

    client = weather_factory(respond=respond)
    with pytest.raises(DataGoError):
        client.short_term(55, 127, "2021-06-28T05:00:00")
    assert client.ledger.calls == 2
    assert not list(client.cache_dir.rglob("*.json"))


# 발표 직후 빈 성공 응답은 영구 캐시에 넣지 않아 나중에 다시 수집할 수 있다.
def test_empty_not_cached(weather_factory: Callable, weather_sample: Callable) -> None:
    payload = weather_sample("ultra")
    payload["response"]["body"].update(items="", totalCount=0, numOfRows=0)
    client = weather_factory(respond=lambda _: httpx.Response(200, json=payload))
    with pytest.raises(DataGoError, match="자료 없음"):
        client.ultra_now(60, 127, "2026-09-25T06:10:00")
    assert not list(client.cache_dir.rglob("*.json"))
    assert weather_factory().ultra_now(60, 127, "2026-09-25T06:10:00")["records"]


# 단건 객체 응답도 행 배열처럼 정규화한다.
def test_singleton_response(weather_factory: Callable, weather_sample: Callable) -> None:
    payload = weather_sample("mid_land")
    items = payload["response"]["body"]["items"]
    items["item"] = items["item"][0]
    result = weather_factory(respond=lambda _: httpx.Response(200, json=payload)).mid_term(
        "11B00000", "2026-09-25T18:00:00"
    )
    assert len(result["records"]) == 9


# 손상된 캐시를 외부 재조회로 덮어쓰지 않고 운영자 확인용 오류를 낸다.
@pytest.mark.parametrize("corruption", ["json", "missing_page", "bad_timestamp", "wrong_grid"])
def test_corrupt_cache(weather_factory: Callable, corruption: str) -> None:
    client = weather_factory()
    client.ultra_now(60, 127, "2026-09-25T06:10:00")
    path = next(client.cache_dir.rglob("*.json"))
    payload = json.loads(path.read_bytes())
    if corruption == "missing_page":
        payload["payloads"] = []
    elif corruption == "bad_timestamp":
        payload["fetched_at"] = "2026-09-25T06:10:00"
    elif corruption == "wrong_grid":
        payload["payloads"][0]["response"]["body"]["items"]["item"][0]["nx"] = 61
    path.write_text("broken" if corruption == "json" else json.dumps(payload))
    with pytest.raises(DataGoError):
        client.ultra_now(60, 127, "2026-09-25T06:10:00")
    assert client.ledger.calls == 1


# 동시에 같은 발표를 요청해도 잠금 안의 두 번째 캐시 확인으로 한 번만 전송한다.
def test_concurrent_cache_hit(weather_factory: Callable) -> None:
    clients = [weather_factory(), weather_factory()]
    barrier = Barrier(2)

    # 서로 다른 연결 자원을 가진 두 클라이언트를 동시에 진입시킨다.
    def fetch(index: int) -> dict:
        barrier.wait(timeout=5)
        return clients[index].ultra_now(60, 127, "2026-09-25T06:10:00")

    with ThreadPoolExecutor(max_workers=2) as pool:
        first, second = list(pool.map(fetch, [0, 1]))
    assert first == second
    assert sum(client.ledger.calls for client in clients) == 1
