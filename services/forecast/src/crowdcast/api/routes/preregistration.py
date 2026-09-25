"""공개 규칙의 선정과 원장 채점 결과를 정본 응답 계약으로 제공한다."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from crowdcast.api.assemble.http import response
from crowdcast.scoring.score import scores
from crowdcast.scoring.select import load_selection

router = APIRouter()


# 선정 API는 문서나 등록 준비본을 쓰지 않고 같은 해시 순서의 요약만 반환한다.
@router.post("/v1/preregistration/select")
async def select() -> JSONResponse:
    return await response("/v1/preregistration/select", lambda: load_selection()[1]["summaries"])


# 실측 부재를 대기로 공개하고 records 오류는 정상 점수로 바꾸지 않는다.
@router.get("/v1/preregistration/scores")
async def score() -> JSONResponse:
    return await response("/v1/preregistration/scores", scores)
