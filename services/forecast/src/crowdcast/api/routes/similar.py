"""행사 계약을 검사하고 공개된 유사 사례를 최대 다섯 건 반환한다."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from crowdcast.analytics.similar import similar as find_similar
from crowdcast.api.assemble.http import body, event_input, response

router = APIRouter()


# 예측과 같은 행사 입력 검사를 거친 뒤 사례 검색에 위임한다.
@router.post("/v1/similar")
async def similar(request: Request) -> JSONResponse:
    event = event_input(await body(request, "/v1/similar"))
    return await response("/v1/similar", lambda: find_similar(event))
