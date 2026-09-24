"""정본 계약을 로컬에 등록하고 응답의 구조와 날짜·URI 형식을 검증한다."""

import json
import re
from datetime import datetime
from functools import lru_cache
from ipaddress import IPv6Address
from typing import Any

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

from crowdcast import paths

# 선택 의존성 유무에 따라 형식 검사가 생략되지 않도록 지역 검사기를 쓴다.
_FORMAT_CHECKER = FormatChecker()
_DATETIME = re.compile(
    r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}"
    r"(?:\.[0-9]+)?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])",
    re.IGNORECASE,
)

# RFC 3986의 URI 구성 규칙으로 상대 경로·공백·깨진 퍼센트 인코딩을 거부한다.
_URI_CHARACTER = r"(?:[A-Za-z0-9._~!$&'()*+,;=-]|%[0-9A-Fa-f]{2})"
_PATH_CHARACTER = rf"(?:{_URI_CHARACTER}|[:@])"
_URI = re.compile(
    r"[A-Za-z][A-Za-z0-9+.-]*:"
    rf"(?://(?:(?:{_URI_CHARACTER}|:)*@)?"
    rf"(?:{_URI_CHARACTER}*|\[(?P<ip_literal>[A-Za-z0-9._~!$&'()*+,;=:%-]+)\])"
    rf"(?::[0-9]*)?(?:/{_PATH_CHARACTER}*)*"
    rf"|/(?:{_PATH_CHARACTER}+(?:/{_PATH_CHARACTER}*)*)?"
    rf"|(?:{_PATH_CHARACTER}+(?:/{_PATH_CHARACTER}*)*)?)"
    rf"(?:\?(?:{_PATH_CHARACTER}|[/?])*)?"
    rf"(?:\#(?:{_PATH_CHARACTER}|[/?])*)?"
)


# RFC 3339의 시간대 표기와 실제 달력 날짜를 함께 검사한다.
@_FORMAT_CHECKER.checks("date-time", raises=ValueError)
def _is_datetime(value: object) -> bool:
    if not isinstance(value, str):
        return True
    if _DATETIME.fullmatch(value) is None:
        return False
    datetime.fromisoformat(value.upper())
    return True


# URI 문법을 확인하고 대괄호 호스트는 IPv6 또는 IPvFuture로 검사한다.
@_FORMAT_CHECKER.checks("uri", raises=ValueError)
def _is_uri(value: object) -> bool:
    if not isinstance(value, str):
        return True
    match = _URI.fullmatch(value)
    if match is None:
        return False
    ip_literal = match.group("ip_literal")
    if ip_literal is None:
        return True

    # IPvFuture 이외의 리터럴은 영역 식별자 없는 IPv6 주소여야 한다.
    if re.fullmatch(r"v[0-9a-f]+\.[a-z0-9._~!$&'()*+,;=:-]+", ip_literal, re.IGNORECASE):
        return True
    if "%" in ip_literal:
        return False
    IPv6Address(ip_literal)
    return True


# 스키마의 $id를 한 번 등록해 상대 $ref도 네트워크 없이 해석한다.
@lru_cache(maxsize=1)
def _validators() -> dict[str, Draft202012Validator]:
    contract_root = paths.REPO_ROOT / "packages" / "contracts"
    schemas: dict[str, Any] = {
        path.name.removesuffix(".schema.json"): json.loads(path.read_text(encoding="utf-8"))
        for path in sorted((contract_root / "schemas").glob("*.schema.json"))
    }
    if not schemas:
        raise FileNotFoundError(f"계약 스키마가 없습니다: {contract_root / 'schemas'}")
    registry = Registry().with_resources(
        (schema["$id"], Resource.from_contents(schema)) for schema in schemas.values()
    )

    # 별도 JSON 스키마가 없는 health도 OpenAPI 정본에서 직접 읽는다.
    openapi = yaml.safe_load((contract_root / "openapi" / "forecast.yaml").read_text(encoding="utf-8"))
    schemas["health"] = openapi["paths"]["/health"]["get"]["responses"]["200"]["content"]["application/json"][
        "schema"
    ]

    # 잘못된 계약 자체는 일찍 실패시키고 검증기를 요청 간 재사용한다.
    validators = {}
    for name, schema in schemas.items():
        Draft202012Validator.check_schema(schema)
        validators[name] = Draft202012Validator(schema, registry=registry, format_checker=_FORMAT_CHECKER)
    return validators


# 확장자를 뺀 계약 이름을 받고 위반 시 jsonschema.ValidationError를 그대로 올린다.
def validate(schema_name: str, obj: object) -> None:
    validators = _validators()
    if schema_name not in validators:
        raise ValueError(f"알 수 없는 계약 스키마: {schema_name}")
    validators[schema_name].validate(obj)
