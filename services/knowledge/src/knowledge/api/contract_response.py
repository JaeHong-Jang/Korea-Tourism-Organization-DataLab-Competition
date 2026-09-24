"""성공·오류 JSON을 반환 직전에 계약으로 검사하고 잘못된 응답은 차단한다."""

import logging
from functools import cache
from typing import Any

from fastapi.responses import JSONResponse
from jsonschema import Draft202012Validator, FormatChecker
from knowledge.convert.documents import schema_registry

logger = logging.getLogger(__name__)

# 별도 JSON Schema가 없는 세 응답은 knowledge.yaml의 인라인 응답 계약을 따른다.
INLINE_SCHEMAS = {
    "health": {
        "type": "object",
        "required": ["status", "version"],
        "properties": {"status": {"const": "ok"}, "version": {"type": "string"}},
    },
    "facts": {
        "type": "object",
        "required": ["revision"],
        "properties": {"revision": {"type": "integer"}},
    },
    "master-version": {
        "type": "object",
        "required": ["masterVersion"],
        "properties": {"masterVersion": {"type": "integer"}},
    },
}


# 로컬 계약 레지스트리를 재사용해 응답 검사 중 외부 참조를 읽지 않는다.
@cache
def response_validator(schema: str) -> Draft202012Validator:
    schemas, registry = schema_registry()
    definition = INLINE_SCHEMAS[schema] if schema in INLINE_SCHEMAS else schemas[schema]
    return Draft202012Validator(definition, registry=registry, format_checker=FormatChecker())


# 내부 오류에는 원래 본문을 담지 않고 유효한 범위 값만 보존한다.
def internal_error_report(content: Any = None) -> dict:
    scope = content if isinstance(content, dict) else {}
    revision, version = scope.get("revision"), scope.get("masterVersion")
    return {
        "gate": "integrity",
        "passed": False,
        "revision": revision if type(revision) is int and revision >= 0 else 0,
        "masterVersion": version if type(version) is int and version >= 1 else 1,
        "violations": [
            {
                "check": "integrity",
                "shapeId": None,
                "nodeId": "",
                "message": "응답 처리 중 내부 오류가 발생했다",
            }
        ],
    }


# 스키마 위반 시 응답 내용 없이 진단 위치만 기록하고 검증된 오류 보고서로 바꾼다.
def contract_response(content: Any, schema: str = "gate-report", *, status_code: int = 200) -> JSONResponse:
    error = next(response_validator(schema).iter_errors(content), None)
    if error is not None:
        logger.error("응답 계약 위반: schema=%s, path=%s, rule=%s", schema, error.json_path, error.validator)
        content = internal_error_report(content)
        response_validator("gate-report").validate(content)
        status_code = 500
    return JSONResponse(status_code=status_code, content=content)
