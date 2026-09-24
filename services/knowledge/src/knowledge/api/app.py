"""근거 그래프 서비스의 라우트와 저장소 수명을 구성한다."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from knowledge import paths
from knowledge.api.facts import router as facts_router
from knowledge.api.health import router as health_router
from knowledge.api.master_version import router as master_router
from knowledge.store.facts import IntegrityError, KnowledgeStore, violations_for


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

    # 참조 실패 응답은 detail로 감싸지 않고 gate-report 자체로 보낸다.
    @application.exception_handler(IntegrityError)
    async def integrity_error(request: Request, error: IntegrityError) -> JSONResponse:
        return JSONResponse(status_code=422, content=error.report)

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
        return JSONResponse(status_code=422, content=report.report)

    return application


# 모듈 임포트만으로 공유 저장소를 만들거나 잠그지 않는다.
app = create_app()
