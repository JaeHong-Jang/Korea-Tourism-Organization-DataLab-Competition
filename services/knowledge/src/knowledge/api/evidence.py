"""발행 문장이 직접 인용한 근거 하나를 계약 원문으로 반환한다."""

from typing import Annotated

from fastapi import APIRouter, Path, Request
from fastapi.responses import JSONResponse
from knowledge.api.contract_response import contract_response
from knowledge.query.evidence import evidence

router = APIRouter()


# 단독 조회도 발행 인용 검사를 생략하지 않는다.
@router.get("/v1/evidence/{id}")
def get_evidence(id: Annotated[str, Path(pattern=r"^ev-")], request: Request) -> JSONResponse:
    card = evidence(request.app.state.knowledge.repository, id)
    return contract_response(card, "evidence")
