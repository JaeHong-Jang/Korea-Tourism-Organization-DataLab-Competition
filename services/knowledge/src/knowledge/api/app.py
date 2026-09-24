"""근거 그래프 서비스의 라우트와 저장소 수명을 구성한다."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from knowledge import paths
from knowledge.api.claim_evidence import router as claim_evidence_router
from knowledge.api.contract_response import contract_response, internal_error_report
from knowledge.api.evidence import router as evidence_router
from knowledge.api.facts import router as facts_router
from knowledge.api.health import router as health_router
from knowledge.api.master_version import router as master_router
from knowledge.api.ontology import router as ontology_router
from knowledge.api.publish import router as publish_router
from knowledge.api.session_graph import router as session_graph_router
from knowledge.api.validate import router as validate_router
from knowledge.query.evidence import UnpublishedResource
from knowledge.store.facts import IntegrityError, KnowledgeStore, violations_for
from knowledge.validate.snapshot import ScopeConflict
from starlette.exceptions import HTTPException

logger = logging.getLogger(__name__)


# 테스트는 메모리 저장소를 주입하고 실제 서버는 기동 때만 디스크를 연다.
def create_app(store: KnowledgeStore | None = None) -> FastAPI:
    # 앱 종료 시 Oxigraph 참조를 해제해 디스크 잠금이 남지 않게 한다.
    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        application.state.knowledge = store if store is not None else KnowledgeStore(paths.STORE)
        try:
            yield
        finally:
            del application.state.knowledge

    # 라우트는 입출력만 맡고 적재 판정은 저장 서비스에 위임한다.
    application = FastAPI(title="인파예보 근거 그래프", version="0.1.0", lifespan=lifespan)
    application.include_router(health_router)
    application.include_router(facts_router)
    application.include_router(master_router)
    application.include_router(validate_router)
    application.include_router(publish_router)
    application.include_router(session_graph_router)
    application.include_router(claim_evidence_router)
    application.include_router(evidence_router)
    application.include_router(ontology_router)

    # 미발행·미존재·소유 세션 충돌은 내용이 드러나지 않는 같은 404로 처리한다.
    @application.exception_handler(UnpublishedResource)
    async def unpublished_resource(request: Request, error: UnpublishedResource) -> JSONResponse:
        return await http_error(request, HTTPException(status_code=404))

    # 검증 범위가 바뀌면 현재 범위를 담은 계약 보고서와 409를 반환한다.
    @application.exception_handler(ScopeConflict)
    async def scope_conflict(request: Request, error: ScopeConflict) -> JSONResponse:
        return contract_response(error.report, status_code=409)

    # 참조 실패 응답은 detail로 감싸지 않고 gate-report 자체로 보낸다.
    @application.exception_handler(IntegrityError)
    async def integrity_error(request: Request, error: IntegrityError) -> JSONResponse:
        return contract_response(error.report, status_code=422)

    # 요청 봉투가 잘못된 경우도 같은 실패 계약과 현재 revision을 유지한다.
    @application.exception_handler(RequestValidationError)
    async def invalid_request(request: Request, error: RequestValidationError) -> JSONResponse:
        knowledge = request.app.state.knowledge
        session_id = request.path_params.get("id", "s-invalid")
        try:
            revision = knowledge.scope(session_id)["revision"]
        except IntegrityError:
            revision = 0
        problems = [f"{'.'.join(map(str, item['loc']))}: {item['msg']}" for item in error.errors()]
        report = IntegrityError(
            revision, knowledge.master.snapshot()[0], violations_for(session_id, problems)
        )
        return contract_response(report.report, status_code=422)

    # 라우트·메서드 오류도 프레임워크의 detail 본문 대신 계약 보고서로 보낸다.
    @application.exception_handler(HTTPException)
    async def http_error(request: Request, error: HTTPException) -> JSONResponse:
        report = IntegrityError(
            0,
            request.app.state.knowledge.master.snapshot()[0],
            violations_for("", [f"HTTP {error.status_code}: 요청을 처리할 수 없다"]),
        )
        response = contract_response(report.report, status_code=error.status_code)
        response.headers.update(error.headers or {})
        return response

    # 예상하지 못한 장애도 원문·예외 내용을 응답에 노출하지 않는다.
    @application.exception_handler(Exception)
    async def server_error(request: Request, error: Exception) -> JSONResponse:
        logger.error("응답 처리 실패: exception=%s", type(error).__name__)
        return contract_response(internal_error_report(), status_code=500)

    return application


# 모듈 임포트만으로 공유 저장소를 만들거나 잠그지 않는다.
app = create_app()
