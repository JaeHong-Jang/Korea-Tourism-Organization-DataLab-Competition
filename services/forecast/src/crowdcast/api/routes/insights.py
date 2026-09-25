"""인사이트와 활용 명세의 저장된 계약 JSON만 반환한다."""

from functools import partial

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from crowdcast.analytics.insights.storage import read
from crowdcast.api.assemble.http import response

router = APIRouter()


# 미생성 사유를 404로 알리고 요청 처리 중에는 계산하지 않는다.
def stored(key: str) -> dict:
    try:
        return read(key)
    except FileNotFoundError as error:
        raise HTTPException(404, str(error)) from None


# 지표 키의 허용 목록을 저장 계층과 공유한다.
@router.get("/v1/insights/{key}")
async def insight(key: str) -> JSONResponse:
    return await response("/v1/insights/{key}", partial(stored, key))


# 활용 명세도 계산이 끝난 스냅샷만 반환한다.
@router.get("/v1/datalab/spec")
async def datalab_spec() -> JSONResponse:
    return await response("/v1/datalab/spec", partial(stored, "datalab-spec"))
