"""허용된 행사 조건만 바꾸고 예측과 같은 조립 경로로 결과를 반환한다."""

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from crowdcast.api.assemble.forecast import predict
from crowdcast.api.assemble.http import body, event_input, response

router = APIRouter()
ALLOWED = {"startsAt", "endsAt", "timeOfDay", "fee", "type", "hazards"}


# 변경 전후 모두 계약과 일정 순서를 검사해 원본 입력을 우회하는 변경도 막는다.
@router.post("/v1/whatif")
async def whatif(request: Request) -> JSONResponse:
    value = await body(request, "/v1/whatif")
    event_input(value["event"])
    if set(value["changes"]) - ALLOWED:
        raise HTTPException(400, "허용되지 않은 행사 조건 변경")
    event = event_input({**value["event"], **value["changes"]})
    return await response("/v1/whatif", lambda: predict(event))
