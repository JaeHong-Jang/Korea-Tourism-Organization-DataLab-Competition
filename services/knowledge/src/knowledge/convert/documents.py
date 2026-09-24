"""순서와 숫자 표현에 흔들리지 않게 계약 문서를 비교하고 검증한다."""

from functools import lru_cache
from typing import Any

import orjson
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

from knowledge.paths import CONTRACTS


# JSON 객체 키 순서는 무시하고 배열 순서와 불리언 타입은 보존한다.
def same_content(left: Any, right: Any) -> bool:
    if isinstance(left, dict) and isinstance(right, dict):
        return left.keys() == right.keys() and all(same_content(left[k], right[k]) for k in left)
    if isinstance(left, list) and isinstance(right, list):
        return len(left) == len(right) and all(same_content(a, b) for a, b in zip(left, right, strict=True))
    if isinstance(left, bool) != isinstance(right, bool):
        return False
    return left == right


# 참조 스키마는 모두 로컬 파일에서 등록해 네트워크 접근을 하지 않는다.
@lru_cache(maxsize=1)
def schema_registry() -> tuple[dict, Registry]:
    schemas = {}
    for path in sorted((CONTRACTS / "schemas").glob("*.schema.json")):
        schemas[path.name.removesuffix(".schema.json")] = orjson.loads(path.read_bytes())
    registry = Registry().with_resources(
        (schema["$id"], Resource.from_contents(schema)) for schema in schemas.values()
    )
    return schemas, registry


# API 입력이 계약 스키마를 통과한 뒤에만 참조 검사로 넘긴다.
def schema_problems(obj: Any, schema: str) -> list[str]:
    schemas, registry = schema_registry()
    validator = Draft202012Validator(schemas[schema], registry=registry, format_checker=FormatChecker())
    return [f"{error.json_path}: {error.message}" for error in validator.iter_errors(obj)]
