"""세션 검증 요청의 범위와 규칙 목록을 검사해 SHACL 서비스에 전달한다."""

from typing import Annotated

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse
from knowledge.api.contract_response import contract_response
from knowledge.store.facts import IntegrityError, violations_for
from knowledge.validate.session import validate_session
from knowledge.validate.shapes import select_shapes

router = APIRouter()


# 긴 검증과 잠금 대기는 동기 작업 스레드에서 처리한다.
@router.post("/v1/sessions/{id}/validate")
def validate(
    id: str,
    request: Request,
    revision: Annotated[int, Query(ge=0)],
    master_version: Annotated[int, Query(alias="masterVersion", ge=1)],
    shapes: str | None = None,
) -> JSONResponse:
    store = request.app.state.knowledge
    try:
        selected = select_shapes(shapes)
    except ValueError as error:
        raise IntegrityError(
            store.scope(id)["revision"], store.master.snapshot()[0], violations_for(id, [str(error)])
        ) from error
    return contract_response(validate_session(store, id, revision, master_version, selected))
