"""기상청 HTTPS 요청에 기존 공공데이터 인증·호출 장부·오류 규칙을 적용한다."""

import re
from typing import Any
from urllib.parse import quote, quote_plus, unquote

import httpx
from crowdcast.config import get_settings
from crowdcast.data.call_ledger import CallLedger
from crowdcast.data.datago_client import DataGoError, TransientDataGoError

# 관광 API의 전역 허용 목록을 바꾸지 않고 기상청의 공식 경로만 허용한다.
ENDPOINTS = {
    "ultra_now": "1360000/VilageFcstInfoService_2.0/getUltraSrtNcst",
    "short_term": "1360000/VilageFcstInfoService_2.0/getVilageFcst",
    "mid_land": "1360000/MidFcstInfoService/getMidLandFcst",
    "mid_temperature": "1360000/MidFcstInfoService/getMidTa",
}


# URL 로깅을 피하는 T-101 전송 계층 방식으로 인증키를 요청에서만 사용한다.
class WeatherTransport:
    # 호출 예산과 전송 자원은 클라이언트 수명 동안 재사용한다.
    def __init__(
        self, ledger: CallLedger, transport: httpx.BaseTransport, *, timeout_seconds: float = 30
    ) -> None:
        self.ledger = ledger
        self.transport = transport
        self.timeout = httpx.Timeout(timeout_seconds)

    # 재시도 한 번마다 같은 공공데이터 장부에 실제 전송 한 건을 먼저 예약한다.
    def request(self, api: str, query: dict[str, str | int]) -> dict[str, Any]:
        key = get_settings().data_go_kr_key
        if key is None:
            raise DataGoError(".env의 DATA_GO_KR_KEY가 필요합니다")
        request = httpx.Request(
            "GET",
            f"https://apis.data.go.kr/{ENDPOINTS[api]}",
            params={**query, "serviceKey": unquote(key.get_secret_value())},
            extensions={"timeout": self.timeout.as_dict()},
        )
        try:
            self.ledger.reserve(f"weather_{api}")
            response = self.transport.handle_request(request)
            try:
                response.read()
            finally:
                response.close()
        except httpx.TransportError:
            raise TransientDataGoError("공공데이터 연결 또는 응답 시간 초과") from None
        finally:
            request.url = request.url.copy_remove_param("serviceKey")

        # 인증·한도 오류는 재시도하지 않고 서버·통신 일시 장애만 재시도한다.
        if response.status_code == 429:
            raise DataGoError("공공데이터 HTTP 429: 호출 한도 초과, 재시도 중단")
        if response.status_code >= 500:
            raise TransientDataGoError(f"공공데이터 일시 HTTP 오류 {response.status_code}")
        if response.status_code != 200:
            raise DataGoError(f"공공데이터 HTTP 오류 {response.status_code}")
        try:
            payload = response.json()
        except ValueError:
            raise DataGoError("공공데이터 JSON 응답 아님: 인증·활용신청 상태 확인") from None

        # 원문·URL 인코딩·JSON 이스케이프 형태의 반사된 키도 캐시에 넣지 않는다.
        secret = key.get_secret_value()
        decoded = unquote(secret)
        variants = {secret, decoded, quote(decoded, safe=""), quote_plus(decoded)}
        if contains_secret(payload, variants):
            raise DataGoError("인증 정보가 반사된 응답은 저장하지 않습니다")
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


# 구조화된 JSON의 키와 문자열 값을 검사하므로 이스케이프에 가려진 비밀도 검출한다.
def contains_secret(value: Any, variants: set[str]) -> bool:
    if isinstance(value, str):
        return any(secret and secret.casefold() in value.casefold() for secret in variants)
    if isinstance(value, list):
        return any(contains_secret(item, variants) for item in value)
    if isinstance(value, dict):
        return any(contains_secret(k, variants) or contains_secret(v, variants) for k, v in value.items())
    return False
