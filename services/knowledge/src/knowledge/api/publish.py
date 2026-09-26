"""현재 범위를 명시한 발행 요청을 원자적 발행 서비스에 전달한다."""

from typing import Annotated

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse
from knowledge.api.contract_response import contract_response
from knowledge.validate.publish import publish_session

router = APIRouter()


# 요청에서 상태나 임의 문장 목록을 받지 않고 저장된 후보만 발행한다.
@router.post("/v1/sessions/{id}/publish")
def publish(
    id: str,
    request: Request,
    revision: Annotated[int, Query(ge=0)],
    master_version: Annotated[int, Query(alias="masterVersion", ge=1)],
) -> JSONResponse:
    return contract_response(publish_session(request.app.state.knowledge, id, revision, master_version))
