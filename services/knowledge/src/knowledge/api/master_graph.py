"""전체 온톨로지·기준 근거 지도를 응답 계약으로 검사해 제공한다."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from knowledge.api.contract_response import contract_response
from knowledge.query.graph_view import master_graph

router = APIRouter()


# 세션 조회와 분리된 지도 서비스의 결과만 계약 JSON으로 반환한다.
@router.get("/v1/master/graph")
def get_master_graph(request: Request) -> JSONResponse:
    return contract_response(master_graph(request.app.state.knowledge.repository), "knowledge-graph")
