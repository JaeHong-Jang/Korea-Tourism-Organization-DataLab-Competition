"""행사 계약을 검사하고 공개 관측에서 만든 전체 예보를 반환한다."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from crowdcast.api.assemble.artifacts import Unavailable
from crowdcast.api.assemble.forecast import predict as assemble_forecast
from crowdcast.api.assemble.http import body, event_input, response
from crowdcast.api.assemble.model import current_model


# 기동 때 모델을 미리 읽되 포인터가 없으면 요청별 503을 낼 수 있게 서버는 연다.
@asynccontextmanager
async def warm_model(app: FastAPI) -> AsyncIterator[None]:
    try:
        await run_in_threadpool(current_model)
    except Unavailable:
        pass
    yield


router = APIRouter(lifespan=warm_model)


# 계약 실패는 400·500으로 구분하고 모델·규칙 계산은 조립층에 맡긴다.
@router.post("/v1/predict")
async def predict(request: Request) -> JSONResponse:
    event = event_input(await body(request, "/v1/predict"))
    return await response("/v1/predict", lambda: assemble_forecast(event))
