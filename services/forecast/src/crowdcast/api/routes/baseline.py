"""평시 조회의 지역·기준일을 검증하고 근거가 포함된 집계 결과를 반환한다."""

import re
from datetime import date

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from jsonschema import ValidationError

from crowdcast.analytics.baseline import baseline as calculate_baseline
from crowdcast.api.assemble.http import endpoint_validator, response

router = APIRouter()


# 필수 쿼리와 날짜 형식을 정본 계약에 맞춰 검사한다.
@router.get("/v1/baseline")
async def baseline(request: Request) -> JSONResponse:
    values = dict(request.query_params)
    try:
        endpoint_validator("/v1/baseline", "query").validate(values)
        if not re.fullmatch(r"[0-9]{5}", values["sigunguCode"]):
            raise ValueError("시군구 코드 형식 오류")
        before = date.fromisoformat(values["before"])
    except (ValidationError, ValueError):
        raise HTTPException(400, "평시 조회 입력 오류") from None
    return await response("/v1/baseline", lambda: calculate_baseline(values["sigunguCode"], before))
