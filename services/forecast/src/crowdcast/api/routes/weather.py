"""날씨 쿼리의 좌표·시각과 응답을 정본 계약으로 검증한다."""

import math

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from jsonschema import ValidationError

from crowdcast.api.assemble.http import endpoint_validator, response
from crowdcast.data.weather.service import weather as get_weather

router = APIRouter()


# 유효한 요청은 날씨가 없어도 200이며 잘못된 좌표·시각은 입력 오류로 구분한다.
@router.get("/v1/weather")
async def weather(request: Request) -> JSONResponse:
    values = dict(request.query_params)
    try:
        for key in ("lat", "lng"):
            values[key] = float(values[key])
        endpoint_validator("/v1/weather", "query").validate(values)
        lat, lng = values["lat"], values["lng"]
        if not (math.isfinite(lat) and math.isfinite(lng) and -90 <= lat <= 90 and -180 <= lng <= 180):
            raise ValueError
    except (KeyError, ValueError, ValidationError):
        raise HTTPException(400, "날씨 조회 입력 오류") from None
    return await response("/v1/weather", lambda: get_weather(lat, lng, values["at"].upper()))
