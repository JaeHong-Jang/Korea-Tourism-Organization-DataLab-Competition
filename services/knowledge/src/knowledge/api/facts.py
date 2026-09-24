"""계약 JSON 적재 요청과 무결성 실패 응답을 연결한다."""

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field

router = APIRouter()


# 별칭을 써서 pydantic의 schema 메서드와 계약의 schema 필드를 구분한다.
class FactsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_name: Literal["event", "forecast", "claim", "evidence", "similar-event", "region-baseline"] = (
        Field(alias="schema")
    )
    items: Annotated[list[Any], Field(min_length=1)]


# 동기 라우트는 작업 스레드에서 실행해 세션 잠금 대기로 이벤트 루프를 막지 않는다.
@router.post("/v1/sessions/{id}/facts")
def facts(id: str, body: FactsRequest, request: Request) -> dict[str, int]:
    revision = request.app.state.knowledge.load_facts(id, body.schema_name, body.items)
    return {"revision": revision}
