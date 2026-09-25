"""정본 OpenAPI로 요청·응답을 검증하고 계약 오류를 400 또는 500으로 반환한다."""

import json
from collections.abc import Callable
from datetime import datetime
from functools import lru_cache
from typing import Any

import yaml
from crowdcast import paths
from crowdcast.analytics.baseline import NoCompleteWindow
from crowdcast.api.assemble.artifacts import Unavailable
from crowdcast.api.assemble.identity import canonical
from crowdcast.api.contract import _validators, validate
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from jsonschema import ValidationError
from starlette.concurrency import run_in_threadpool


# 관측 부재는 호출자가 일괄 예보 불가 사유로 집계할 수 있게 별도 코드로 보낸다.
class NoObservation(Unavailable):
    pass


# 기존 계약 레지스트리와 형식 검사기를 그대로 이용해 인라인 스키마도 검사한다.
@lru_cache(maxsize=32)
def endpoint_validator(path: str, part: str) -> Any:
    file = paths.REPO_ROOT / "packages/contracts/openapi/forecast.yaml"
    operation = yaml.safe_load(file.read_text(encoding="utf-8"))["paths"][path]
    operation = operation.get("post", operation.get("get"))
    if part == "query":
        parameters = operation["parameters"]
        schema = {
            "type": "object",
            "required": [item["name"] for item in parameters if item.get("required")],
            "properties": {item["name"]: item["schema"] for item in parameters},
        }
    else:
        content = operation["requestBody"] if part == "request" else operation["responses"]["200"]
        schema = content["content"]["application/json"]["schema"]
    schema = {"$id": "https://crowdcast.local/openapi/forecast.yaml", **schema}
    return _validators()["event"].evolve(schema=schema)


# JSON 문법·형식 위반은 FastAPI 기본 422 대신 계약의 400으로 통일한다.
async def body(request: Request, path: str) -> Any:
    try:
        value = await request.json()
        endpoint_validator(path, "request").validate(value)
        canonical(value)
    except (ValueError, ValidationError):
        raise HTTPException(400, "요청 계약 위반") from None
    return value


# 행사 스키마 외에 종료 순서와 음수 예산·회차를 입구에서 거부한다.
def event_input(value: dict[str, Any]) -> dict[str, Any]:
    try:
        validate("event", value)
        if datetime.fromisoformat(value["endsAt"].upper()) < datetime.fromisoformat(
            value["startsAt"].upper()
        ):
            raise ValueError("종료가 시작보다 빠릅니다")
        if any(value[key] is not None and value[key] < 0 for key in ("budgetKrw", "edition")):
            raise ValueError("음수 행사 속성")
    except (ValueError, ValidationError):
        raise HTTPException(400, "행사 입력 오류") from None
    return value


# 내부 계산과 응답 검증은 작업 스레드에서 실행하고 실패를 정상 응답으로 감추지 않는다.
async def response(path: str, calculation: Callable[[], Any]) -> JSONResponse:
    # JSON 응답의 유한성도 전송 전에 확인한다.
    def calculate() -> Any:
        value = calculation()
        endpoint_validator(path, "response").validate(value)
        return json.loads(canonical(value))

    try:
        value = await run_in_threadpool(calculate)
    except NoObservation:
        return JSONResponse(
            {
                "code": "NO_OBSERVATION",
                "message": "공개된 지역 관측·전회차 실측이 없어 예보를 만들 수 없어요",
            },
            status_code=503,
        )
    except Unavailable as error:
        raise HTTPException(503, str(error)) from None
    except NoCompleteWindow as error:
        return JSONResponse({"code": "NO_COMPLETE_WINDOW", "message": str(error)}, status_code=404)
    except FileNotFoundError:
        raise HTTPException(404, "요청한 공개 자료가 없습니다") from None
    except (ValueError, KeyError, TypeError, ValidationError):
        raise HTTPException(500, "내부 자료 또는 응답 계약 위반") from None
    return JSONResponse(value)
