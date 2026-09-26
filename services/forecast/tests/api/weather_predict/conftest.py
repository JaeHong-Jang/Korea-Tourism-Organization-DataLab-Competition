"""실제 예보 조립 경로에 고정 시각과 원본 발표 계보가 있는 가짜 기상청 자료를 제공한다."""

from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml
from crowdcast import paths
from crowdcast.data.weather import service
from crowdcast.data.weather.client import WeatherClient, result_dict
from crowdcast.data.weather.normalize import as_kst, empty_record
from crowdcast.models import weather_adjust


# 외부 통신 없이 원본 클라이언트 결과부터 계약 응답까지 연결한다.
@pytest.fixture
def rain_weather(event: dict, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> SimpleNamespace:
    target = as_kst(event["startsAt"])
    state = SimpleNamespace(current=target - timedelta(days=2), calls=[], pop=70, pty="비", target=target)
    config_path = tmp_path / "weather_adjustment.yaml"
    config_path.write_text("min_samples: 3\ncoefficients: []\n")
    state.config = config_path
    load_config = weather_adjust.load_config
    monkeypatch.setattr(weather_adjust, "load_config", lambda: load_config(config_path))
    monkeypatch.setattr(paths, "CACHE", tmp_path / "cache")
    monkeypatch.setattr(service, "now", lambda: state.current)
    monkeypatch.setattr(service, "weather_regions", lambda lat, lng: ("11B00000", "11B10101"))

    # 발표·수집·대상 시각을 각각 보존하고 중기 도시 기온은 별도 수집으로 만든다.
    def snapshot(product: str, issued: datetime, location: dict) -> dict:
        state.calls.append(product)
        record = {**empty_record(target), "precipitation_probability_pct": state.pop,
                  "precipitation_type": state.pty, "sky": "흐림", "temperature_c": 18.5}
        fetched = state.current
        if product.startswith("mid_"):
            record.update(valid_until=(target + timedelta(hours=12)).isoformat(), temperature_c=None)
        if product == "mid_temperature":
            record.update(temperature_min_c=15, temperature_max_c=23)
            fetched += timedelta(seconds=1)
        return result_dict(
            {"records": [record], "fetched_at": fetched.isoformat(),
             "source_url": "https://apis.data.go.kr/1360000/fixture", "source_hash": "a" * 64},
            product=product, issued_at=issued, location=location,
        )

    monkeypatch.setattr(WeatherClient, "_grid", lambda self, api, nx, ny, issued_at:
                        snapshot(api, issued_at, {"nx": nx, "ny": ny}))
    monkeypatch.setattr(WeatherClient, "mid_term", lambda self, region, base:
                        snapshot("mid_land" if region == "11B00000" else "mid_temperature",
                                 base, {"region_code": region}))
    return state


# 실제 사용 계수와 부족·범위 밖 계수를 같은 설정 형식으로 만든다.
@pytest.fixture
def coefficient() -> dict:
    return {"type": "불꽃", "rain_grade": "우천", "multiplier": 0.8,
            "sample_count": 5, "dry_sample_count": 6,
            "period_from": "2023-01-01", "period_to": "2024-12-31",
            "source": "ASOS 일자료·영종 씨사이드파크 실버 순증 비교 테스트"}


# 계수 설정 변경도 실제 YAML 로딩을 거치게 한다.
@pytest.fixture
def configure(rain_weather: SimpleNamespace):
    # 파일 교체 뒤 다음 요청에서 캐시 없이 새 설정을 읽는지 확인한다.
    def write(coefficient: dict) -> None:
        rain_weather.config.write_text(yaml.safe_dump({"min_samples": 3, "coefficients": [coefficient]}))
    return write
