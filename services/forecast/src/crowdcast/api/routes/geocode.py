"""장소 요청을 검증하고 기존 지명 검색의 모호한 후보를 그대로 반환한다."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from crowdcast.api.assemble.http import body, response
from crowdcast.data.geocode import candidates

router = APIRouter()


# 후보 선택은 호출자에게 맡기고 점수·좌표를 다시 계산하지 않는다.
@router.post("/v1/geocode")
async def geocode(request: Request) -> JSONResponse:
    value = await body(request, "/v1/geocode")
    return await response(
        "/v1/geocode",
        lambda: {
            "candidates": candidates(value["venueText"], value.get("sidoHint")),
        },
    )
