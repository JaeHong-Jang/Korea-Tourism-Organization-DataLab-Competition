"""근거 사용 통계와 그래프 크기를 계약 검사 후 응답한다."""

import logging
import re
from collections.abc import Awaitable, Callable

import orjson
from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import JSONResponse
from knowledge.api.contract_response import contract_response, internal_error_report, response_validator
from knowledge.query.datalab_usage import datalab_usage
from knowledge.query.graph_stats import graph_stats
from knowledge.store.validation_log import record_validation
from knowledge.validate.shapes import select_shapes
from starlette.concurrency import run_in_threadpool

router = APIRouter()
logger = logging.getLogger(__name__)


# 응답 계약 검사 뒤의 실제 gate-report를 기록해 내부 오류도 통과로 세지 않는다.
def record_validation_response(
    response: JSONResponse, session_id: str, shapes: tuple[str, ...]
) -> JSONResponse:
    record_validation(orjson.loads(response.body), session_id, shapes)
    return response


# 범위 충돌·잘못된 요청도 기존 오류 응답을 그대로 유지하며 검증 통계에 기록한다.
def validation_error_handler(
    handler: Callable[[Request, Exception], Awaitable[JSONResponse]],
) -> Callable[[Request, Exception], Awaitable[JSONResponse]]:
    # 기존 오류 처리기가 만든 계약 보고서만 기록하고 다른 API는 건드리지 않는다.
    async def logged_error(request: Request, error: Exception) -> JSONResponse:
        response = await handler(request, error)
        match = re.fullmatch(r"/v1/sessions/([^/]+)/validate", request.url.path)
        if request.scope["type"] == "http" and request.method == "POST" and match:
            shapes = request.query_params.get("shapes")
            try:
                selected = select_shapes(shapes)
            except ValueError:
                selected = tuple(shapes.split(",")) if shapes is not None else ()
            await run_in_threadpool(record_validation_response, response, match[1], selected)
        return response

    return logged_error


# 앱의 기존 오류 처리기를 등록한 뒤 감싸 정상 결과와 오류 결과를 각각 한 번만 센다.
def register_validation_logging(application: FastAPI) -> None:
    for error_type, handler in tuple(application.exception_handlers.items()):
        application.add_exception_handler(error_type, validation_error_handler(handler))


# 질의 계층에서 집계한 발행 통계만 계약 필드 그대로 응답한다.
@router.get(
    "/v1/stats/datalab-usage",
    response_description=(
        "publishedClaims·claimsWithEvidence·claimsReachingDatalab은 세션 그래프·문장 ID 쌍을 센다. "
        "evidenceByDataset.count는 데이터셋별 전역 고유 근거 ID 수이며, "
        "같은 근거를 여러 세션이 인용해도 1건이다. 미발행 문장과 그 문장만 인용한 근거는 제외한다."
    ),
)
def usage(request: Request) -> JSONResponse:
    return contract_response(datalab_usage(request.app.state.knowledge.repository), "datalab-usage")


# 별도 스키마가 없는 그래프 크기는 정본 ops-status의 하위 정의로 검사한다.
@router.get("/v1/stats/graph")
def graph(request: Request) -> JSONResponse:
    content = graph_stats(request.app.state.knowledge.repository)
    validator = response_validator("ops-status").evolve(
        schema={"$ref": "https://crowdcast.local/schemas/ops-status.schema.json#/$defs/graphStats"}
    )
    error = next(validator.iter_errors(content), None)
    if error is not None:
        logger.error("응답 계약 위반: schema=graphStats, path=%s, rule=%s", error.json_path, error.validator)
        return contract_response(internal_error_report(content), status_code=500)
    return JSONResponse(content=content)
