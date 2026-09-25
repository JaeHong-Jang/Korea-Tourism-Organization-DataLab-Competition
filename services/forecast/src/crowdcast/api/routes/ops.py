"""실행 기록과 자료 최신성 배열을 정본 운영 계약으로 검증해 반환한다."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from crowdcast.api.assemble.http import response
from crowdcast.pipeline.freshness import freshness
from crowdcast.pipeline.run_record import list_records

router = APIRouter()


# 손상 기록을 제외한 최신 실행을 최대 오십 개 반환한다.
@router.get("/v1/runs")
async def runs() -> JSONResponse:
    return await response("/v1/runs", list_records)


# 미수집 자료는 null을 유지하고 외부 호출 없이 저장 상태만 조회한다.
@router.get("/v1/ops/freshness")
async def ops_freshness() -> JSONResponse:
    return await response("/v1/ops/freshness", freshness)
