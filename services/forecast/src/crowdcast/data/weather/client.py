"""행사 격자·예보 구역의 날씨를 발표별 캐시와 근거가 있는 KST dict로 제공한다."""

from datetime import datetime, timedelta
from functools import partial
from pathlib import Path
from typing import Any

import httpx
from crowdcast.data.call_ledger import CallLedger
from crowdcast.data.weather.cache import WeatherCache
from crowdcast.data.weather.grid import validate_grid
from crowdcast.data.weather.mid_term import mid_records, region_api
from crowdcast.data.weather.normalize import as_kst, grid_records
from crowdcast.data.weather.transport import WeatherTransport
from crowdcast.paths import CACHE


# 캐시 디렉터리를 바꾸더라도 기본 장부는 T-101의 datago/ledger.csv를 공유한다.
class WeatherClient:
    # 테스트에서는 임시 장부와 MockTransport만 주입하며 키는 .env에서만 읽는다.
    def __init__(
        self,
        *,
        cache_dir: Path | None = None,
        ledger_path: Path | None = None,
        max_calls: int = 800,
        transport: httpx.BaseTransport | None = None,
        timeout_seconds: float = 30,
        attempts: int = 3,
    ) -> None:
        self.cache_dir = cache_dir if cache_dir is not None else CACHE / "weather"
        self.ledger = CallLedger(
            ledger_path if ledger_path is not None else CACHE / "datago/ledger.csv", max_calls=max_calls
        )
        self._transport = transport if transport is not None else httpx.HTTPTransport(retries=0)
        self._cache = WeatherCache(
            self.cache_dir,
            WeatherTransport(self.ledger, self._transport, timeout_seconds=timeout_seconds),
            attempts=attempts,
        )

    # 여러 종류의 날씨 요청에서 연결 풀을 재사용한다.
    def __enter__(self) -> "WeatherClient":
        return self

    # 예외 종료 때도 전송 자원을 닫는다.
    def __exit__(self, *exc: object) -> None:
        self._transport.close()

    # at 시점에 제공 가능한 최근 정시 실황을 선택한다(공식 API 제공 지연 10분).
    def ultra_now(self, nx: int, ny: int, at: datetime | str) -> dict[str, Any]:
        stamp = as_kst(at) - timedelta(minutes=10)
        issued_at = stamp.replace(minute=0, second=0, microsecond=0)
        return self._grid("ultra_now", nx, ny, issued_at)

    # base는 조회 현재시각이 아닌 명시적인 발표시각으로 02시부터 3시간 간격이다.
    def short_term(self, nx: int, ny: int, base: datetime | str) -> dict[str, Any]:
        issued_at = validate_base(base, {2, 5, 8, 11, 14, 17, 20, 23})
        return self._grid("short_term", nx, ny, issued_at)

    # 광역 코드면 육상 날씨, 도시 코드면 일 최저·최고기온을 반환한다.
    def mid_term(self, region_code: str, base: datetime | str) -> dict[str, Any]:
        issued_at = validate_base(base, {6, 18})
        api = region_api(region_code)
        snapshot = self._cache.get(
            api,
            {"regId": region_code, "tmFc": issued_at.strftime("%Y%m%d%H%M")},
            partial(
                mid_records,
                region_code=region_code,
                issued_at=issued_at,
                temperature=api == "mid_temperature",
            ),
        )
        return result_dict(snapshot, product=api, issued_at=issued_at, location={"region_code": region_code})

    # API마다 같은 격자·발표 형식과 정규화 검증을 사용한다.
    def _grid(self, api: str, nx: int, ny: int, issued_at: datetime) -> dict[str, Any]:
        validate_grid(nx, ny)
        snapshot = self._cache.get(
            api,
            {
                "nx": nx,
                "ny": ny,
                "base_date": issued_at.strftime("%Y%m%d"),
                "base_time": issued_at.strftime("%H%M"),
            },
            partial(grid_records, nx=nx, ny=ny, issued_at=issued_at, observed=api == "ultra_now"),
        )
        return result_dict(snapshot, product=api, issued_at=issued_at, location={"nx": nx, "ny": ny})


# 잘못된 발표시각을 다른 회차로 조용히 바꾸지 않고 호출 전에 거절한다.
def validate_base(base: datetime | str, hours: set[int]) -> datetime:
    stamp = as_kst(base)
    if stamp.hour not in hours or stamp.minute or stamp.second or stamp.microsecond:
        raise ValueError("해당 예보의 정규 발표시각이 필요합니다")
    return stamp


# 수집시점을 보수적인 가용시점으로 남겨 과거 발표시각으로 수집 근거를 소급하지 않는다.
def result_dict(
    snapshot: dict[str, Any], *, product: str, issued_at: datetime, location: dict[str, Any]
) -> dict[str, Any]:
    available_at = max(as_kst(snapshot["fetched_at"]), issued_at).isoformat()
    evidence = {
        "source": "기상청",
        "source_url": snapshot["source_url"],
        "source_hash": snapshot["source_hash"],
        "issued_at": issued_at.isoformat(),
        "fetched_at": snapshot["fetched_at"],
        "available_at": available_at,
        **location,
    }
    records = [
        {
            **record,
            "estimated": product != "ultra_now",
            "available_at": available_at,
            "evidence": [evidence.copy()],
        }
        for record in snapshot["records"]
    ]
    return {
        "product": product,
        "timezone": "Asia/Seoul",
        "issued_at": issued_at.isoformat(),
        "fetched_at": snapshot["fetched_at"],
        "available_at": available_at,
        **location,
        "records": records,
        "evidence": [evidence],
    }
