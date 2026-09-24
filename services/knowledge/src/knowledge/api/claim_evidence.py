"""문장이 발행된 세션에서 인용 근거 카드 목록을 반환한다."""

from typing import Annotated

from fastapi import APIRouter, Path, Request
from fastapi.responses import JSONResponse
from knowledge.api.contract_response import contract_response
from knowledge.query.evidence import claim_evidence

router = APIRouter()


# 조회 서비스에서 발행 여부와 소유 세션을 확인하고 응답 계약을 검사한다.
@router.get("/v1/claims/{id}/evidence")
def get_claim_evidence(id: Annotated[str, Path(pattern=r"^c-")], request: Request) -> JSONResponse:
    cards = claim_evidence(request.app.state.knowledge.repository, id)
    return contract_response(cards, "claim-evidence")
