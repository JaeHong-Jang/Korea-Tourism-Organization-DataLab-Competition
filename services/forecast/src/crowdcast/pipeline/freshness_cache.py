"""수집 캐시의 검증된 응답 시각과 특일 보유 연도를 외부 호출 없이 읽는다."""

import json
import logging
from datetime import date, datetime
from functools import lru_cache
from pathlib import Path

from crowdcast import paths
from crowdcast.data.call_ledger import KST
from crowdcast.data.datago_client import DataGoClient, DataGoError
from crowdcast.data.weather.cache import parse_bundle

LOGGER = logging.getLogger(__name__)


# 원자적으로 교체된 캐시만 다시 파싱하며 대량 방문자 캐시의 반복 조회 비용을 줄인다.
@lru_cache(maxsize=8192)
def _metadata(path: Path, modified: int, size: int, weather: bool) -> tuple[datetime, int, frozenset[int]]:
    raw = path.read_bytes()
    if weather:
        pages = parse_bundle(raw)
    else:
        body = json.loads(raw)["payload"]["response"]["body"]
        pages = [DataGoClient._parse(raw, int(body["pageNo"]), max(1, int(body["numOfRows"])))]
    years = frozenset(
        date.fromisoformat(str(item["locdate"])).year
        for page in pages
        for item in page.items
        if "locdate" in item
    )
    return max(page.fetched_at for page in pages), sum(len(page.items) for page in pages), years


# 오류·빈 방문자 응답을 성공 수집으로 세지 않고 파일 수정 시각으로 수집일을 추측하지 않는다.
def cache_status(*apis: str, weather: bool = False) -> tuple[str | None, set[int]]:
    root = paths.CACHE / ("weather" if weather else "datago")
    latest: datetime | None = None
    years: set[int] = set()
    for api in apis:
        for path in (root / api).glob("*.json"):
            try:
                stat = path.stat()
                stamp, rows, held = _metadata(path, stat.st_mtime_ns, stat.st_size, weather)
                if api == "visitors" and not rows:
                    continue
                latest = max(latest, stamp) if latest else stamp
                years.update(held)
            except (OSError, ValueError, TypeError, KeyError, DataGoError):
                LOGGER.warning("%s 수집 캐시를 건너뜁니다", api)
    return latest.astimezone(KST).isoformat() if latest else None, years
