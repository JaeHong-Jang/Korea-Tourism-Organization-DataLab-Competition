"""계약의 타입 경로와 JSON-LD 컨텍스트로 RDF를 만든다."""

from copy import deepcopy
from functools import lru_cache
from typing import Any

import orjson
from pyld import jsonld
from rdflib import Graph

from knowledge.paths import JSONLD

BASE = "http://crowdcast.local/id/"


# 계약 정본을 한 번 읽고 변환마다 사본에만 타입을 붙인다.
@lru_cache(maxsize=1)
def contract_context() -> tuple[dict, dict]:
    return (
        orjson.loads((JSONLD / "context.jsonld").read_bytes()),
        orjson.loads((JSONLD / "types.json").read_bytes()),
    )


# 점과 배열 표기로 지정한 모든 객체에 계약 타입을 붙인다.
def apply_types(obj: dict, path: str, cls: str) -> None:
    if not path:
        obj.setdefault("@type", cls)
        return
    head, _, rest = path.partition(".")
    key, many = (head[:-2], True) if head.endswith("[]") else (head, False)
    value = obj.get(key)
    for target in value if many and isinstance(value, list) else [value]:
        if isinstance(target, dict):
            apply_types(target, rest, cls)


# 포함된 하위 스키마도 같은 규칙으로 처리해 타입 스코프를 보존한다.
def typed(obj: dict, schema: str, rules: dict) -> dict:
    result = deepcopy(obj)
    for path, cls in rules[schema].items():
        if path != "@include":
            apply_types(result, path, cls)
            continue
        for sub_path, sub_schema in cls.items():
            key, many = (sub_path[:-2], True) if sub_path.endswith("[]") else (sub_path, False)
            if many:
                result[key] = [typed(item, sub_schema, rules) for item in result.get(key, [])]
            elif isinstance(result.get(key), dict):
                result[key] = typed(result[key], sub_schema, rules)
    return result


# 외부 컨텍스트 조회를 막아 변환이 로컬 계약만 사용하게 한다.
def reject_remote_document(url: str, options: Any = None) -> None:
    raise ValueError(f"외부 JSON-LD 문서는 허용하지 않는다: {url}")


# pyld의 숫자 리터럴을 N-Quads로 전달해 기준 구현과 같은 그래프를 얻는다.
def json_to_graph(obj: dict, schema: str) -> Graph:
    context, rules = contract_context()
    if schema not in rules or schema in {"note", "idRules"}:
        raise ValueError(f"변환할 수 없는 스키마: {schema}")
    document = {"@context": context["@context"], **typed(obj, schema, rules)}
    nquads = jsonld.to_rdf(
        document,
        {
            "format": "application/n-quads",
            "base": BASE,
            "documentLoader": reject_remote_document,
        },
    )
    return Graph().parse(data=nquads, format="nquads")
