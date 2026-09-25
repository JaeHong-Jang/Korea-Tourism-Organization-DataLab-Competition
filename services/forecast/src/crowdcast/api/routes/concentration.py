"""행사 기간 시군구 관광지 집중률 예측 요약 — 하루 한 번 수집한 캐시를 쓰고 수집 실패는 503으로 알린다."""

from datetime import date

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from jsonschema import ValidationError

from crowdcast.analytics.concentration import summarize
from crowdcast.api.assemble.artifacts import Unavailable
from crowdcast.api.assemble.http import endpoint_validator, response
from crowdcast.data.concentration import fetch_concentration
from crowdcast.data.datago_client import DataGoClient

router = APIRouter()

# 강원·전북 특별자치도의 새 시도 코드가 비면 옛 시도 코드로 한 번 더 묻는다.
LEGACY_AREA = {"51": "42", "52": "45"}


# 시군구 관광지 30일 예측을 받아 온다(하루 캐시·공유 호출 장부를 지난다).
def collect(sigungu_code: str) -> list[dict]:
    try:
        with DataGoClient(max_calls=6) as client:
            rows = fetch_concentration(client, area_code=sigungu_code[:2], sigungu_code=sigungu_code)
            legacy = LEGACY_AREA.get(sigungu_code[:2])
            if not rows and legacy:
                rows = fetch_concentration(client, area_code=legacy, sigungu_code=sigungu_code)
    except Exception as error:
        raise Unavailable("관광지 집중률 예측을 지금 받아 오지 못했어요") from error
    return rows


@router.get("/v1/concentration")
async def concentration(request: Request) -> JSONResponse:
    values = dict(request.query_params)
    try:
        endpoint_validator("/v1/concentration", "query").validate(values)
        start, end = date.fromisoformat(values["from"]), date.fromisoformat(values["to"])
        if end < start:
            raise ValueError
    except (KeyError, ValueError, ValidationError):
        raise HTTPException(400, "관광지 집중률 조회 입력 오류") from None
    code = values["sigunguCode"]
    return await response("/v1/concentration", lambda: summarize(code, start, end, collect(code)))
