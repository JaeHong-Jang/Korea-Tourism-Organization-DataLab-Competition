"""서비스에 적재된 온톨로지 정의를 Turtle로 반환한다."""

from fastapi import APIRouter, Request
from fastapi.responses import Response
from knowledge.api.contract_response import turtle_response
from knowledge.store.repository import TBOX

router = APIRouter()


# 인스턴스와 기준 자료를 제외한 TBox만 직렬화한다.
@router.get("/v1/ontology")
def get_ontology(request: Request) -> Response:
    graph = request.app.state.knowledge.repository.read_graph(TBOX)
    return turtle_response(graph.serialize(format="turtle"))
