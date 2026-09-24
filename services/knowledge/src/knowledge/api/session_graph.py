"""세션의 발행된 부분만 계약 컨텍스트를 쓰는 JSON-LD로 반환한다."""

from typing import Annotated

from fastapi import APIRouter, Path, Request
from fastapi.responses import JSONResponse
from knowledge.api.contract_response import contract_response
from knowledge.query.published_graph import session_graph
from knowledge.query.runner import QueryScope

router = APIRouter()


# 세션 식별 검증을 마친 뒤 공개 부분 추출을 조회 계층에 맡긴다.
@router.get("/v1/sessions/{id}/graph")
def get_session_graph(
    id: Annotated[str, Path(pattern=r"^s-[a-z0-9][a-z0-9_.:-]{1,120}$")], request: Request
) -> JSONResponse:
    scope = QueryScope(request.app.state.knowledge.repository, id)
    return contract_response(session_graph(scope), "session-graph")
