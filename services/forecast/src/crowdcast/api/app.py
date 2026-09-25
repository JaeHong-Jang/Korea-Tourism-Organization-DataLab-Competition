"""예측 서비스 앱에 리소스별 라우트를 등록한다."""

from fastapi import FastAPI

from crowdcast.api.routes import (
    backtest,
    baseline,
    geocode,
    health,
    images,
    insights,
    model_card,
    ops,
    predict,
    preregistration,
    regions,
    similar,
    upcoming,
    weather,
    whatif,
)
from crowdcast.config import get_settings

# 서비스 메타데이터와 상태 확인 라우트를 등록한다.
settings = get_settings()
app = FastAPI(title=settings.service_name, version=settings.version)
app.include_router(health.router)
app.include_router(geocode.router)
app.include_router(baseline.router)
app.include_router(similar.router)
app.include_router(model_card.router)
app.include_router(backtest.router)
app.include_router(predict.router)
app.include_router(whatif.router)
app.include_router(upcoming.router)
app.include_router(images.router)
app.include_router(regions.router)
app.include_router(preregistration.router)
app.include_router(ops.router)
app.include_router(weather.router)
app.include_router(insights.router)
