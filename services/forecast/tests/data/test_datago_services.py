"""집중률·행사·장소·특일 클라이언트의 공식 요청 필드와 공개 시점 보존을 검증한다."""

from collections.abc import Callable
from datetime import date, datetime

import httpx
import pytest
from crowdcast.data import concentration
from crowdcast.data.concentration import fetch_concentration
from crowdcast.data.holidays import fetch_holidays
from crowdcast.data.tourapi import search_festivals, search_places


# 원본 명세의 단건 응답 구조를 실제 한국 관광지·행사·공휴일로 구성한다.
def service_response(item: dict) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "response": {
                "header": {"resultCode": "00", "resultMsg": "NORMAL SERVICE."},
                "body": {"pageNo": 1, "numOfRows": 1000, "totalCount": 1, "items": {"item": item}},
            }
        },
    )


# 집중률은 미래 관측일로 공개일을 소급하지 않고 수집일별 캐시를 쓴다.
def test_concentration_snapshot(datago_factory: Callable, monkeypatch: pytest.MonkeyPatch) -> None:
    # 집중률 전용 코드 이름과 관광지명을 그대로 전송한다.
    def respond(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/B551011/TatsCnctrRateService/tatsCnctrRatedList"
        assert request.url.params["areaCd"] == "41" and request.url.params["signguCd"] == "110"
        assert request.url.params["tAtsNm"] == "수원화성"
        return service_response({"tAtsNm": "수원화성", "baseYmd": "20260930", "cnctrRate": "45.1"})

    client = datago_factory(respond=respond)
    monkeypatch.setattr(concentration, "korea_today", lambda: date(2026, 9, 25))
    result = fetch_concentration(client, area_code="41", sigungu_code="110", attraction_name="수원화성")
    assert result[0]["estimated"] is True
    assert datetime.fromisoformat(result[0]["available_at"]).tzinfo is not None
    assert len(result[0]["source_hash"]) == 64
    assert (
        fetch_concentration(client, area_code="41", sigungu_code="110", attraction_name="수원화성") == result
    )
    assert client.ledger.calls == 1
    monkeypatch.setattr(concentration, "korea_today", lambda: date(2026, 9, 26))
    fetch_concentration(client, area_code="41", sigungu_code="110", attraction_name="수원화성")
    assert client.ledger.calls == 2


# 행사 검색에는 현재 KorService2 경로와 일자 범위 파라미터를 쓴다.
def test_festival_request(datago_factory: Callable) -> None:
    # 명세의 행사 필드를 변경하지 않고 근거 메타데이터만 추가한다.
    def respond(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/B551011/KorService2/searchFestival2"
        assert request.url.params["eventStartDate"] == "20250901"
        assert request.url.params["eventEndDate"] == "20251031"
        return service_response(
            {"contentid": "506224", "title": "수원화성문화제", "eventstartdate": "20251004"}
        )

    result = search_festivals(datago_factory(respond=respond), date(2025, 9, 1), date(2025, 10, 31))
    assert result[0]["title"] == "수원화성문화제" and "available_at" in result[0]


# 한국어와 공백이 포함된 장소 검색어를 중복 인코딩하지 않는다.
def test_keyword_request(datago_factory: Callable) -> None:
    # HTTP 계층에서 복원한 검색어가 사용자 입력과 일치해야 한다.
    def respond(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/B551011/KorService2/searchKeyword2"
        assert request.url.params["keyword"] == "수원 화성"
        return service_response(
            {"contentid": "126538", "title": "수원화성", "mapx": "127.015", "mapy": "37.28"}
        )

    assert search_places(datago_factory(respond=respond), "수원 화성")[0]["mapx"] == "127.015"


# 특일은 공휴일 조회 기능과 두 자리 월을 사용한다.
def test_holiday_request(datago_factory: Callable) -> None:
    # 발표일을 알 수 없는 공휴일도 원본 달력 날짜와 수집 시점을 분리한다.
    def respond(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/B090041/openapi/service/SpcdeInfoService/getRestDeInfo"
        assert request.url.params["solYear"] == "2025" and request.url.params["solMonth"] == "10"
        return service_response({"dateName": "한글날", "locdate": 20251009, "seq": 1, "isHoliday": "Y"})

    result = fetch_holidays(datago_factory(respond=respond), 2025, 10)
    assert result[0]["locdate"] == 20251009 and "available_at" in result[0]


# 명백히 잘못된 입력에는 예산을 쓰지 않는다.
def test_service_validation_without_calls(datago_factory: Callable) -> None:
    client = datago_factory(max_calls=0)
    with pytest.raises(ValueError):
        fetch_holidays(client, 2025, 13)
    with pytest.raises(ValueError):
        search_places(client, " ")
    with pytest.raises(ValueError):
        search_festivals(client, date(2025, 9, 7), date(2025, 9, 1))
    assert client.ledger.calls == 0
