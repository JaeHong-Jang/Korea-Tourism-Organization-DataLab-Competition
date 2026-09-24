"""예측 서비스 앱에 리소스별 라우트를 등록한다."""

from fastapi import FastAPI

from crowdcast.api.routes import health
from crowdcast.config import get_settings

# 서비스 메타데이터와 상태 확인 라우트를 등록한다.
settings = get_settings()
app = FastAPI(title=settings.service_name, version=settings.version)
app.include_router(health.router)
