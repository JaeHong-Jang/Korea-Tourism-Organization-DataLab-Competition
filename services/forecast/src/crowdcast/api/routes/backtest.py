"""지정 실행 또는 사용 모델 포인터의 백테스트를 계약 그대로 반환한다."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from crowdcast.api.assemble.artifacts import document
from crowdcast.api.assemble.http import response

router = APIRouter()


# 실행 폴더가 없으면 마지막 후보로 대체하지 않고 조회 실패로 드러낸다.
@router.get("/v1/backtest/{run_id}")
async def backtest(run_id: str) -> JSONResponse:
    return await response("/v1/backtest/{runId}", lambda: document("backtest", run_id))
