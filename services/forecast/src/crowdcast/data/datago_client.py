"""공공데이터 JSON 페이지를 비밀 없는 캐시·공유 장부·제한된 재시도로 가져온다."""

import hashlib
import json
import re
from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote, quote_plus, unquote

import httpx
from tenacity import Retrying, retry_if_exception_type, stop_after_attempt, wait_exponential

from crowdcast.config import get_settings
from crowdcast.data.call_ledger import CallLedger, atomic_write, file_lock
from crowdcast.paths import CACHE

# 공식 활용명세의 HTTPS 경로만 허용해 인증키가 다른 호스트로 전달되지 않게 한다.
ENDPOINTS = {
    "visitors": "B551011/DataLabService/locgoRegnVisitrDDList",
    "concentration": "B551011/TatsCnctrRateService/tatsCnctrRatedList",
    "festivals": "B551011/KorService2/searchFestival2",
    "places": "B551011/KorService2/searchKeyword2",
    "holidays": "B090041/openapi/service/SpcdeInfoService/getRestDeInfo",
    "asos": "1360000/AsosHourlyInfoService/getWthrDataList",
}
ITEM_KEYS = {
    "asos": ("tm", "stnId"),
    "visitors": ("baseYmd", "signguCode", "touDivCd"),
    "concentration": ("baseYmd", "tAtsNm"),
    "festivals": ("contentid",),
    "places": ("contentid",),
    "holidays": ("locdate", "seq"),
}


# 예외에 포함된 인증키의 원문·URL 인코딩형을 지운 뒤 진단에 필요한 문구만 남긴다.
def safe_error(exc: Exception) -> str:
    message = str(exc)
    key = get_settings().data_go_kr_key
    if key is not None:
        secret = key.get_secret_value()
        variants = {secret, unquote(secret), quote(unquote(secret), safe=""), quote_plus(unquote(secret))}
        for variant in sorted(variants, key=len, reverse=True):
            if variant:
                message = re.sub(re.escape(variant), "[REDACTED]", message, flags=re.IGNORECASE)
    return re.sub(r"(?i)(servicekey[=\s:]+)[^&\s]+", r"\1[REDACTED]", message)[:1500]


# 응답 본문이나 인증키가 든 URL을 예외 문자열에 포함하지 않는다.
class DataGoError(RuntimeError):
    pass


# 통신·서버 일시 장애만 재시도하고 인증·한도 오류는 즉시 중단한다.
class TransientDataGoError(DataGoError):
    pass


# 각 페이지의 원본 해시와 수집 시점을 정규화된 행에 전달한다.
@dataclass(frozen=True)
class ApiPage:
    items: list[dict[str, Any]]
    total_count: int
    page_no: int
    num_rows: int
    source_hash: str
    fetched_at: datetime


# 전송 자원을 소유하고 호출 예산은 모든 API와 재시도 사이에서 공유한다.
class DataGoClient:
    # 키는 설정의 .env에서만 읽으며 테스트에서는 전송 계층만 대체한다.
    def __init__(
        self,
        *,
        cache_dir: Path | None = None,
        max_calls: int = 800,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.cache_dir = cache_dir if cache_dir is not None else CACHE / "datago"
        self.ledger = CallLedger(self.cache_dir / "ledger.csv", max_calls=max_calls)
        self._transport = transport if transport is not None else httpx.HTTPTransport(retries=0)

    # with 블록에서 여러 페이지에 같은 연결 풀을 사용한다.
    def __enter__(self) -> "DataGoClient":
        return self

    # 정상·오류 종료 모두 연결을 닫는다.
    def __exit__(self, *exc: object) -> None:
        self._transport.close()

    # 공통 파라미터를 고정하고 키를 요청 해시나 캐시 메타데이터에 넣지 않는다.
    def page(
        self,
        api: str,
        params: Mapping[str, str | int],
        *,
        page_no: int = 1,
        num_rows: int = 1000,
        cache_scope: str = "",
    ) -> ApiPage:
        if api not in ENDPOINTS or page_no < 1 or not 1 <= num_rows <= 1000:
            raise ValueError("API 또는 페이지 범위 오류")
        reserved = {"servicekey", "mobileos", "mobileapp", "_type", "pageno", "numofrows"}
        if any(name.lower() in reserved for name in params):
            raise ValueError("공통 인증·페이지 파라미터는 덮어쓸 수 없습니다")
        query = {
            **params,
            "MobileOS": "ETC",
            "MobileApp": "CrowdCast",
            "_type": "json",
            "pageNo": page_no,
            "numOfRows": num_rows,
        }
        identity = json.dumps([ENDPOINTS[api], query, cache_scope], sort_keys=True, ensure_ascii=False)
        digest = hashlib.sha256(identity.encode()).hexdigest()
        path = self.cache_dir / api / f"{digest}.json"

        # 같은 요청이 겹쳐도 캐시 확인부터 저장까지 한 번만 전송한다.
        with file_lock(path.with_suffix(".lock")):
            if path.exists():
                cached = self._parse(path.read_bytes(), page_no, num_rows)
                if api != "visitors" or cached.total_count:
                    return cached
                path.unlink()

            # 방문자 0행은 공개 전 응답이므로 다음 실행의 재조회를 막는 캐시를 남기지 않는다.
            retry = Retrying(
                stop=stop_after_attempt(3),
                wait=wait_exponential(min=1, max=4),
                retry=retry_if_exception_type(TransientDataGoError),
                reraise=True,
            )
            payload = retry(self._request, api, query)
            envelope = {"fetched_at": datetime.now(UTC).isoformat(), "payload": payload}
            raw = json.dumps(envelope, ensure_ascii=False, sort_keys=True).encode()
            page = self._parse(raw, page_no, num_rows)
            if api != "visitors" or page.total_count:
                atomic_write(path, raw)
            return page

    # 헤더가 가리키는 전체 행 수를 채울 때까지 페이지를 순서대로 읽는다.
    def pages(
        self,
        api: str,
        params: Mapping[str, str | int],
        *,
        num_rows: int = 1000,
        cache_scope: str = "",
    ) -> Iterator[ApiPage]:
        page_no, received, total = 1, 0, None
        seen: set[tuple[str, ...]] = set()
        while True:
            try:
                page = self.page(api, params, page_no=page_no, num_rows=num_rows, cache_scope=cache_scope)
            except DataGoError as exc:
                raise DataGoError(f"api={api}, page={page_no}: {exc}") from None
            if total is not None and page.total_count != total:
                raise DataGoError(f"api={api}, page={page_no}: 페이지 사이 전체 행 수 변경")
            for item in page.items:
                if any(item.get(field) in (None, "") for field in ITEM_KEYS[api]):
                    raise DataGoError(f"api={api}, page={page_no}: 항목 식별자 누락")
                identity = tuple(str(item[field]) for field in ITEM_KEYS[api])
                if identity in seen:
                    raise DataGoError(f"api={api}, page={page_no}: 페이지 항목 반복")
                seen.add(identity)
            total = page.total_count
            received += len(page.items)
            if received > total or (not page.items and received < total):
                raise DataGoError("응답 페이지가 누락되거나 전체 행 수를 초과했습니다")
            yield page
            if received == total:
                return
            page_no += 1

    # URL을 기록하는 상위 HTTP 클라이언트 대신 전송 계층을 직접 사용한다.
    def _request(self, api: str, query: dict[str, str | int]) -> dict[str, Any]:
        key = get_settings().data_go_kr_key
        if key is None:
            raise DataGoError(".env의 DATA_GO_KR_KEY가 필요합니다")
        request = httpx.Request(
            "GET",
            f"https://apis.data.go.kr/{ENDPOINTS[api]}",
            params={**query, "serviceKey": unquote(key.get_secret_value())},
            extensions={"timeout": httpx.Timeout(30).as_dict()},
        )
        self.ledger.reserve(api)
        try:
            response = self._transport.handle_request(request)
            try:
                response.read()
            finally:
                response.close()
        except httpx.TransportError:
            raise TransientDataGoError("공공데이터 연결 또는 응답 시간 초과") from None
        finally:
            request.url = request.url.copy_remove_param("serviceKey")

        # HTTP 오류·서비스 오류를 구분하고 응답의 자유 문구는 노출하지 않는다.
        if response.status_code == 429:
            raise DataGoError("공공데이터 HTTP 429: 호출 한도 초과, 재시도 중단")
        if response.status_code >= 500:
            raise TransientDataGoError(f"공공데이터 일시 HTTP 오류 {response.status_code}")
        if response.status_code != 200:
            raise DataGoError(f"공공데이터 HTTP 오류 {response.status_code}")
        if key.get_secret_value() in response.text or unquote(key.get_secret_value()) in response.text:
            raise DataGoError("인증 정보가 반사된 응답은 저장하지 않습니다")
        try:
            payload = response.json()
        except ValueError:
            raise DataGoError("공공데이터 JSON 응답 아님: 인증·활용신청 상태 확인") from None
        try:
            code = str(payload["response"]["header"]["resultCode"])
        except (KeyError, TypeError):
            raise DataGoError("공공데이터 응답 헤더 누락") from None
        if code in {"22", "23"}:
            raise DataGoError(f"공공데이터 서비스 한도 오류 {code}: 재시도 중단")
        if code in {"01", "05"}:
            raise TransientDataGoError("공공데이터 서비스 일시 오류")
        if code not in {"00", "0", "0000"}:
            label = code if re.fullmatch(r"\d{1,4}", code) else "알 수 없음"
            raise DataGoError(f"공공데이터 서비스 오류 {label}: 인증·파라미터·한도 확인")
        return payload

    # 단건 객체·빈 문자열을 정규화하고 불완전한 페이지를 캐시로 확정하지 않는다.
    @staticmethod
    def _parse(raw: bytes, page_no: int, num_rows: int) -> ApiPage:
        try:
            envelope = json.loads(raw)
            response = envelope["payload"]["response"]
            if str(response["header"]["resultCode"]) not in {"00", "0", "0000"}:
                raise ValueError
            body = response["body"]
            items = body.get("items") or {}
            rows = items.get("item") or []
            rows = [rows] if isinstance(rows, dict) else rows
            total, number, size = int(body["totalCount"]), int(body["pageNo"]), int(body["numOfRows"])
            fetched_at = datetime.fromisoformat(envelope["fetched_at"])
            if total == 0 and rows == [] and size == 0:
                size = num_rows
            if (
                not isinstance(rows, list)
                or any(not isinstance(row, dict) for row in rows)
                or number != page_no
                or not 1 <= size <= num_rows
                or total < 0
                or len(rows) != min(size, max(0, total - (number - 1) * size))
                or fetched_at.tzinfo is None
            ):
                raise ValueError
        except (ValueError, KeyError, TypeError, AttributeError):
            raise DataGoError("공공데이터 페이지 형식 오류: 캐시·응답 확인 필요") from None
        return ApiPage(rows, total, number, size, hashlib.sha256(raw).hexdigest(), fetched_at)
