"""서비스 상태와 패키지 버전을 계약 검증 뒤 반환한다."""

from fastapi import APIRouter

from crowdcast.api.contract import validate
from crowdcast.config import get_settings

router = APIRouter()


# 외부 서비스 연결 없이 이 프로세스의 응답 가능 여부를 알린다.
@router.get("/health")
def health() -> dict[str, str]:
    response = {"status": "ok", "version": get_settings().version}
    validate("health", response)
    return response
