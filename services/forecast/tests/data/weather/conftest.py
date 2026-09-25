"""날씨 테스트의 .env·캐시·공유 장부·전송을 임시 디렉터리로 격리한다."""

import json
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
from crowdcast import config
from crowdcast.data.weather.client import WeatherClient


# 공식 가이드 응답 예제를 JSON으로 저장한 픽스처를 새 객체로 읽는다.
@pytest.fixture
def weather_sample() -> Callable[[str], dict[str, Any]]:
    # 테스트의 값 변경이 다른 테스트로 새지 않게 매번 파일을 파싱한다.
    def read(name: str) -> dict[str, Any]:
        path = Path(__file__).parents[1] / "fixtures/weather" / f"{name}_sample.json"
        return json.loads(path.read_bytes())

    return read


# 기존 데이터 테스트와 동일하게 실제 키 대신 임시 .env의 가짜 키만 사용한다.
@pytest.fixture
def weather_factory(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Iterator[Callable[..., WeatherClient]]:
    env_file = tmp_path / ".env"
    env_file.write_text("DATA_GO_KR_KEY=weather-fixture-token+/=\n", encoding="utf-8")
    monkeypatch.setattr(config, "ENV_FILE", env_file)
    config.get_settings.cache_clear()
    clients: list[WeatherClient] = []

    # 기본 응답은 서울 종로의 요청 발표·좌표를 따라가는 합성 회귀 예보다.
    def respond(request: httpx.Request) -> httpx.Response:
        query = request.url.params
        observed = request.url.path.endswith("getUltraSrtNcst")
        values = {"T1H" if observed else "TMP": "21.5", "PTY": "0", "WSD": "2.3"}
        if not observed:
            values.update(POP="60", SKY="4")
        rows = [
            {
                "baseDate": query["base_date"],
                "baseTime": query["base_time"],
                "nx": int(query["nx"]),
                "ny": int(query["ny"]),
                "category": category,
                "obsrValue" if observed else "fcstValue": value,
                **({} if observed else {"fcstDate": query["base_date"], "fcstTime": "2300"}),
            }
            for category, value in values.items()
        ]
        return httpx.Response(200, json=weather_payload(rows))

    # 모든 생성 인스턴스가 같은 임시 장부를 공유한다.
    def create(
        *, respond: Callable[[httpx.Request], httpx.Response] = respond, max_calls: int = 800
    ) -> WeatherClient:
        client = WeatherClient(
            cache_dir=tmp_path / "weather",
            ledger_path=tmp_path / "datago/ledger.csv",
            max_calls=max_calls,
            transport=httpx.MockTransport(respond),
        )
        clients.append(client)
        return client

    yield create
    for client in clients:
        client.__exit__()
    config.get_settings.cache_clear()


# 합성 경계 사례의 행과 페이지 번호를 실제 API의 응답 봉투에 넣는다.
def weather_payload(rows: list[dict[str, Any]], *, page: int = 1, total: int | None = None) -> dict[str, Any]:
    return {
        "response": {
            "header": {"resultCode": "00", "resultMsg": "NORMAL_SERVICE"},
            "body": {
                "dataType": "JSON",
                "items": {"item": rows},
                "pageNo": page,
                "numOfRows": 1000,
                "totalCount": len(rows) if total is None else total,
            },
        }
    }
