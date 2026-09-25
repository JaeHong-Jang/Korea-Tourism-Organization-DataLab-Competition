"""지정 버전 또는 사용 모델 포인터의 모델 카드를 계약 그대로 반환한다."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from crowdcast.api.assemble.artifacts import document
from crowdcast.api.assemble.http import response

router = APIRouter()


# latest 후보와 공유 모델 카드 파일은 조회하지 않는다.
@router.get("/v1/model-card/{version}")
async def model_card(version: str) -> JSONResponse:
    return await response("/v1/model-card/{version}", lambda: document("model-card", version))
