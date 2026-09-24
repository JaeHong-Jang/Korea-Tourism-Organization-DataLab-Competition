"""검증 스냅샷에 고정할 기준 그래프 버전을 응답한다."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from knowledge.api.contract_response import contract_response

router = APIRouter()


# 버전은 파일 상수가 아니라 현재 저장된 기준 그래프에서 읽는다.
@router.get("/v1/master/version")
def master_version(request: Request) -> JSONResponse:
    version, _ = request.app.state.knowledge.master.snapshot()
    return contract_response({"masterVersion": version}, "master-version")
