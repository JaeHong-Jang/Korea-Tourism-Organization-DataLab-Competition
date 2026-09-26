"""개발 실행기가 확인할 서비스 상태를 응답한다."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from knowledge.api.contract_response import contract_response

router = APIRouter()


# 외부 서비스 호출 없이 현재 프로세스의 버전을 알린다.
@router.get("/health")
def health() -> JSONResponse:
    return contract_response({"status": "ok", "version": "0.1.0"}, "health")
