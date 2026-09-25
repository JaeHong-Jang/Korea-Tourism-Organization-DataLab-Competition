"""기상청 발표별 전체 페이지를 검증한 뒤 잠금·원자적 저장으로 캐시한다."""

import hashlib
import json
from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from typing import Any

from crowdcast.data.call_ledger import KST, atomic_write, file_lock
from crowdcast.data.datago_client import ApiPage, DataGoClient, DataGoError, TransientDataGoError
from crowdcast.data.weather.transport import ENDPOINTS, WeatherTransport
from tenacity import Retrying, retry_if_exception_type, stop_after_attempt, wait_exponential


# 발표 시각·좌표·서비스가 같으면 인증키와 무관하게 같은 캐시를 읽는다.
class WeatherCache:
    # 날씨 캐시만 별도 디렉터리에 두고 호출 장부는 전송 계층에서 공유한다.
    def __init__(self, path: Path, transport: WeatherTransport) -> None:
        self.path = path
        self.transport = transport

    # 모든 페이지와 날씨 값 검증이 끝나기 전에는 성공 캐시를 남기지 않는다.
    def get(
        self,
        api: str,
        params: dict[str, str | int],
        normalize: Callable[[list[dict[str, Any]]], list[dict[str, Any]]],
    ) -> dict[str, Any]:
        identity = json.dumps([ENDPOINTS[api], params], sort_keys=True).encode()
        path = self.path / api / f"{hashlib.sha256(identity).hexdigest()}.json"
        with file_lock(path.with_suffix(".lock")):
            cached = path.exists()
            raw = path.read_bytes() if cached else self._fetch(api, params)
            pages = parse_bundle(raw)
            records = normalize([item for page in pages for item in page.items])
            if not records:
                raise DataGoError("기상청 자료 없음: 발표·제공 시각 확인 필요")
            if not cached:
                atomic_write(path, raw)
            return {
                "records": records,
                "source_hash": hashlib.sha256(raw).hexdigest(),
                "fetched_at": pages[0].fetched_at.astimezone(KST).isoformat(),
                "source_url": f"https://apis.data.go.kr/{ENDPOINTS[api]}",
            }

    # 단기예보가 천 행을 넘어도 전체 행 수까지 순차적으로 수집한다.
    def _fetch(self, api: str, params: dict[str, str | int]) -> bytes:
        payloads: list[dict[str, Any]] = []
        total, received = None, 0
        retry = Retrying(
            stop=stop_after_attempt(3),
            wait=wait_exponential(min=1, max=4),
            retry=retry_if_exception_type(TransientDataGoError),
            reraise=True,
        )
        while True:
            query = {**params, "dataType": "JSON", "pageNo": len(payloads) + 1, "numOfRows": 1000}
            payload = retry(self.transport.request, api, query)
            fetched_at = datetime.now(KST).isoformat()
            raw_page = json.dumps({"payload": payload, "fetched_at": fetched_at}).encode()
            page = DataGoClient._parse(raw_page, len(payloads) + 1, 1000)
            if not page.items or (total is not None and page.total_count != total):
                raise DataGoError("기상청 자료 없음 또는 페이지 사이 전체 행 수 변경")
            total = page.total_count
            received += len(page.items)
            payloads.append(payload)
            if received >= total:
                return json.dumps(
                    {"fetched_at": fetched_at, "payloads": payloads}, ensure_ascii=False, sort_keys=True
                ).encode()


# T-101 페이지 검증을 재사용하고 전체 묶음의 누락·초과·페이지 크기 변경도 막는다.
def parse_bundle(raw: bytes) -> list[ApiPage]:
    try:
        envelope = json.loads(raw)
        payloads = envelope["payloads"]
        if not isinstance(payloads, list) or not payloads:
            raise ValueError
        pages = [
            DataGoClient._parse(
                json.dumps({"fetched_at": envelope["fetched_at"], "payload": payload}).encode(), number, 1000
            )
            for number, payload in enumerate(payloads, 1)
        ]
        if (
            any(page.total_count != pages[0].total_count for page in pages)
            or any(page.num_rows != pages[0].num_rows for page in pages)
            or sum(len(page.items) for page in pages) != pages[0].total_count
            or any(not page.items for page in pages)
        ):
            raise ValueError
        return pages
    except (ValueError, KeyError, TypeError):
        raise DataGoError("기상청 캐시·페이지 묶음 형식 오류") from None
