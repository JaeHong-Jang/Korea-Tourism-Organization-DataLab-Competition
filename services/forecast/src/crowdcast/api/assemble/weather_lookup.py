"""요청 예보에만 기존 날씨 서비스를 호출하고 실제 선택한 발표의 계보를 보존한다."""

from collections.abc import Callable
from contextvars import ContextVar
from datetime import datetime, timedelta
from typing import Any

import httpx
from crowdcast import paths
from crowdcast.data.call_ledger import CallLimitReached
from crowdcast.data.datago_client import DataGoError
from crowdcast.data.weather import service
from crowdcast.data.weather.client import WeatherClient
from crowdcast.data.weather.mid_term import region_api
from crowdcast.data.weather.normalize import as_kst
from crowdcast.data.weather.stale_cache import cached_results

REQUEST_WEATHER: ContextVar[bool] = ContextVar("request_weather", default=False)


# 기존 클라이언트의 캐시·호출 한도·시간 제한을 유지하며 원본 발표 메타데이터만 모은다.
class EvidenceClient(WeatherClient):
    # 서비스가 조회한 결과만 기록하며 발표 시각을 현재 시각으로 추정하지 않는다.
    def __init__(self, target: datetime) -> None:
        super().__init__(
            cache_dir=paths.CACHE / "weather", ledger_path=paths.CACHE / "datago/ledger.csv",
            timeout_seconds=1, attempts=1, max_calls=3,
        )
        self.target = target
        self.snapshots: list[dict[str, Any]] = []

    # 서비스와 같은 이전 성공 캐시 선택 규칙으로 장애 대체의 실제 발표도 기록한다.
    def _capture(
        self, api: str, location: dict[str, Any], base: datetime,
        fetch: Callable[[], dict[str, Any]],
    ) -> dict[str, Any]:
        try:
            snapshot = fetch()
        except (DataGoError, CallLimitReached, OSError):
            snapshot = next(
                (item for item in cached_results(self.cache_dir, api, location, base)
                 if service.select_record(item, self.target) is not None),
                None,
            )
            if snapshot is None:
                raise
        self.snapshots.append(snapshot)
        return snapshot

    # 실황과 단기는 공통 격자 요청의 원본 발표를 그대로 남긴다.
    def _grid(self, api: str, nx: int, ny: int, issued_at: datetime) -> dict[str, Any]:
        fetch = super()._grid
        return self._capture(api, {"nx": nx, "ny": ny}, issued_at, lambda: fetch(api, nx, ny, issued_at))

    # 중기 육상·기온은 별도 발표이므로 서로의 수집시각과 출처를 덮어쓰지 않는다.
    def mid_term(self, region_code: str, base: datetime | str) -> dict[str, Any]:
        fetch = super().mid_term
        return self._capture(
            region_api(region_code), {"regId": region_code}, as_kst(base), lambda: fetch(region_code, base)
        )


# 일괄·과거·열흘 초과·좌표 결측은 클라이언트도 만들지 않으며 조회 실패는 기존 예보로 돌아간다.
def event_weather(event: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]] | None:
    if not REQUEST_WEATHER.get():
        return None
    target = as_kst(event["startsAt"].upper())
    if not timedelta(0) <= target - as_kst(service.now()) <= timedelta(days=10):
        return None
    lat, lng = event["venue"]["lat"], event["venue"]["lng"]
    if lat is None or lng is None:
        return None
    try:
        with EvidenceClient(target) as client:
            weather = service.weather(lat, lng, target, client=client)
        if weather["source"] == "없음" or weather["fetchedAt"] is None:
            return None
        selected = []
        for snapshot in client.snapshots:
            record = service.select_record(snapshot, target)
            if record is None:
                continue
            # 오래된 단기 캐시의 다른 날짜 예보를 행사일 날씨로 발행하지 않는다.
            if snapshot["product"] == "short_term" and as_kst(record["valid_at"]).date() != target.date():
                continue
            selected.append(snapshot)
        main = "mid_land" if weather["source"] == "중기예보" else (
            "short_term" if weather["source"] == "단기예보" else "ultra_now"
        )
        if not any(item["product"] == main and item["fetched_at"] == weather["fetchedAt"]
                   for item in selected):
            return None
        return weather, selected
    except (DataGoError, CallLimitReached, OSError, httpx.HTTPError, ValueError, KeyError, TypeError):
        return None
