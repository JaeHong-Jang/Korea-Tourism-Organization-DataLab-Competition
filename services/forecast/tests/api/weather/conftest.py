"""날씨 HTTP 테스트의 시계·기상청 응답·캐시·호출 장부를 임시 자료로 격리한다."""

from collections.abc import Iterator
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest
import tenacity
from crowdcast import config
from crowdcast.data.call_ledger import KST
from crowdcast.data.weather import cache, service
from crowdcast.data.weather.client import WeatherClient
from fastapi.testclient import TestClient


# 서울 종로 좌표와 고정된 현재시각으로 실제 FastAPI·기상청 클라이언트 전체 경로를 연결한다.
@pytest.fixture
def weather_api(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Iterator[SimpleNamespace]:
    state = SimpleNamespace(current=datetime(2026, 9, 25, 9, 30, tzinfo=KST), mode="ok", calls=[], pty="1")
    env = tmp_path / ".weather.env"
    env.write_text("DATA_GO_KR_KEY=weather-api-fixture-token%2B%2F%3D\n")
    monkeypatch.setattr(config, "ENV_FILE", env)
    config.get_settings.cache_clear()
    monkeypatch.setattr(service, "now", lambda: state.current)
    monkeypatch.setattr(service, "weather_regions", lambda lat, lng: ("11B00000", "11B10101"))
    monkeypatch.setattr(tenacity.nap.time, "sleep", lambda _: None)

    # 실제 수집시각도 고정해 오래된 캐시를 새 응답처럼 보이게 만들지 않는지 검사한다.
    class CacheClock(datetime):
        # 서비스 시계와 동일한 시각을 반환하되 원래 시간대 요청을 따른다.
        @classmethod
        def now(cls, tz: object = None) -> datetime:
            return state.current.astimezone(tz)

    monkeypatch.setattr(cache, "datetime", CacheClock)

    # 요청 URL을 가진 예외·반사된 키를 재현해 전송 계층의 정제도 함께 검증한다.
    def respond(request: httpx.Request) -> httpx.Response:
        query = request.url.params
        state.calls.append(request)
        if state.mode == "timeout":
            raise httpx.ReadTimeout(str(request.url), request=request)
        if state.mode == "reflected":
            return httpx.Response(
                200, json={"response": {"header": {"resultCode": "00", "resultMsg": query["serviceKey"]}}}
            )
        if state.mode == "http429" or (
            state.mode == "temperature_error" and request.url.path.endswith("getMidTa")
        ):
            return httpx.Response(429)
        rows = (
            mid_rows(query, request.url.path.endswith("getMidTa"))
            if "regId" in query
            else grid_rows(query, request.url.path.endswith("getUltraSrtNcst"), state.pty)
        )
        return httpx.Response(
            200,
            json={
                "response": {
                    "header": {"resultCode": "00"},
                    "body": {
                        "dataType": "JSON",
                        "items": {"item": rows},
                        "pageNo": 1,
                        "numOfRows": 1000,
                        "totalCount": len(rows),
                    },
                }
            },
        )

    # 모든 요청은 같은 임시 캐시·장부를 쓰고 네트워크 대신 MockTransport만 호출한다.
    kma = WeatherClient(
        cache_dir=tmp_path / "weather",
        ledger_path=tmp_path / "ledger.csv",
        transport=httpx.MockTransport(respond),
        timeout_seconds=1,
        attempts=1,
    )
    state.kma = kma
    state.http = client
    monkeypatch.setattr(service, "WeatherClient", lambda **options: kma)
    yield state
    kma.__exit__()
    config.get_settings.cache_clear()


# 단기 예보를 시간마다 다르게 만들어 가장 가까운 시각 선택을 값으로 검증한다.
def grid_rows(query: httpx.QueryParams, observed: bool, pty: str) -> list[dict]:
    base = datetime.strptime(query["base_date"] + query["base_time"], "%Y%m%d%H%M")
    rows = []
    for offset in [0] if observed else range(1, 85):
        stamp = base + timedelta(hours=offset)
        values = {"T1H" if observed else "TMP": "21.5" if observed else str(stamp.hour), "PTY": pty}
        if not observed:
            values.update(SKY="4", POP="60")
        for category, value in values.items():
            rows.append(
                {
                    "baseDate": query["base_date"],
                    "baseTime": query["base_time"],
                    "nx": int(query["nx"]),
                    "ny": int(query["ny"]),
                    "category": category,
                    "obsrValue" if observed else "fcstValue": value,
                    **(
                        {}
                        if observed
                        else {"fcstDate": stamp.strftime("%Y%m%d"), "fcstTime": stamp.strftime("%H%M")}
                    ),
                }
            )
    return rows


# 중기의 반일·일 예보와 도시별 최저·최고기온을 공식 필드 이름으로 재생한다.
def mid_rows(query: httpx.QueryParams, temperature: bool) -> list[dict]:
    row = {"regId": query["regId"]}
    for day in range(4, 11):
        if temperature:
            row.update({f"taMin{day}": 15, f"taMax{day}": 25})
        else:
            for period in ("Am", "Pm") if day < 8 else ("",):
                row.update(
                    {
                        f"rnSt{day}{period}": 80 if period == "Pm" else 40,
                        f"wf{day}{period}": "흐리고 비" if period == "Pm" else "구름많음",
                    }
                )
    return [row]
