"""API별 식별자로 페이지 반복을 막고 진단 출력에서 인증키를 지우는지 검증한다."""

from collections.abc import Callable
from urllib.parse import quote

import httpx
import pytest
from crowdcast.data.datago_client import DataGoError, safe_error

ITEMS = {
    "visitors": {"baseYmd": "20250901", "signguCode": "11110", "touDivCd": "1"},
    "concentration": {"baseYmd": "20260930", "tAtsNm": "수원화성"},
    "festivals": {"contentid": "506224", "title": "수원화성문화제"},
    "places": {"contentid": "126538", "title": "수원화성"},
    "holidays": {"locdate": 20251009, "seq": 1, "dateName": "한글날"},
}


# 페이지 번호와 측정값이 달라도 같은 관측·콘텐츠 식별자를 다시 세지 않는다.
@pytest.mark.parametrize("api", ITEMS)
def test_duplicate_identity_across_pages(datago_factory: Callable, api: str) -> None:
    # 한 행짜리 두 페이지에 같은 식별자를 담아 반복 페이지를 모사한다.
    def respond(request: httpx.Request) -> httpx.Response:
        page_no = int(request.url.params["pageNo"])
        return httpx.Response(
            200,
            json={
                "response": {
                    "header": {"resultCode": "00"},
                    "body": {
                        "pageNo": page_no,
                        "numOfRows": 1,
                        "totalCount": 2,
                        "items": {"item": [{**ITEMS[api], "value": page_no}]},
                    },
                }
            },
        )

    client = datago_factory(respond=respond)
    with pytest.raises(DataGoError, match=f"api={api}, page=2: 페이지 항목 반복"):
        list(client.pages(api, {}, num_rows=1))
    assert client.ledger.calls == 2
    with pytest.raises(DataGoError, match="페이지 항목 반복"):
        list(datago_factory(max_calls=0).pages(api, {}, num_rows=1))


# 원문·인코딩·이중 인코딩 키와 자유문구를 모두 가리고 원인 정보는 유지한다.
def test_safe_error_redacts_all_key_forms(datago_factory: Callable) -> None:
    datago_factory()
    secret = "fixture-only-token+/="
    message = safe_error(
        ValueError(
            f"HTTP 429: {secret} {quote(secret, safe='')} "
            f"serviceKey={quote(quote(secret, safe=''), safe='')}&pageNo=2"
        )
    )
    assert "fixture-only" not in message
    assert "HTTP 429" in message and "pageNo=2" in message
