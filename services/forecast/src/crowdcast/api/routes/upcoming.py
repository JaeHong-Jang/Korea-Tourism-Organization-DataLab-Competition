"""다가오는 행사 요약을 날짜 범위로 조회하고 정본 응답 계약을 검사한다."""

from datetime import date
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from jsonschema import ValidationError

from crowdcast.analytics.upcoming import check_range
from crowdcast.analytics.upcoming import upcoming as find_upcoming
from crowdcast.api.assemble.http import endpoint_validator, response
from crowdcast.api.assemble.locations import attach_locations
from crowdcast.data.image_cache import attach_images

router = APIRouter()


# 선택 날짜는 양끝을 포함하며 생략한 쪽은 저장된 전체 범위를 허용한다.
@router.get("/v1/festivals/upcoming")
async def upcoming(request: Request) -> JSONResponse:
    values = dict(request.query_params)
    try:
        endpoint_validator("/v1/festivals/upcoming", "query").validate(values)
        start = date.fromisoformat(values["from"]) if "from" in values else None
        end = date.fromisoformat(values["to"]) if "to" in values else None
        check_range(start, end)
    except (ValueError, ValidationError):
        raise HTTPException(400, "다가오는 행사 조회 날짜 오류") from None

    # 본문과 헤더는 파일 교체 사이에 갈라지지 않도록 같은 parquet 스냅샷에서 가져온다.
    headers = {}

    # 내부 감사 식별자는 본문 계약에 추가하지 않고 응답 헤더로만 전달한다.
    def calculate() -> list[dict[str, Any]]:
        run_id, rows = find_upcoming(start, end)
        headers["X-Run-Id"] = run_id
        return attach_locations(attach_images(rows))

    # 기존 응답 검증·오류 변환을 거친 정상 결과에 실행 식별자를 붙인다.
    result = await response("/v1/festivals/upcoming", calculate)
    result.headers.update(headers)
    return result


# 일괄 예보 입력을 그대로 반환하고 목록에 없는 식별자는 404로 구분한다.
@router.get("/v1/festivals/upcoming/{event_id}/event")
async def event(event_id: str) -> JSONResponse:
    path = "/v1/festivals/upcoming/{eventId}/event"
    try:
        endpoint_validator(path, "query").validate({"eventId": event_id})
    except ValidationError:
        raise HTTPException(400, "행사 식별자 오류") from None
    return await response(path, lambda: find_upcoming(event_id=event_id)[1][0])
