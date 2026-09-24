"""계약 픽스처를 Python(jsonschema, draft 2020-12)으로 검증하고 {픽스처: 통과 여부} JSON을 출력한다."""
import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parents[1]


# 모든 스키마를 $id로 등록해 파일 사이 $ref를 풀 수 있게 한다
def build_registry() -> tuple[Registry, dict[str, dict]]:
    schemas = {p.name.removesuffix(".schema.json"): json.loads(p.read_text(encoding="utf-8")) for p in (ROOT / "schemas").glob("*.schema.json")}
    registry = Registry().with_resources((s["$id"], Resource.from_contents(s)) for s in schemas.values())
    return registry, schemas


# 픽스처 폴더 이름 = 스키마 이름으로 짝지어 검증한다(형식 검사 포함)
def main() -> None:
    registry, schemas = build_registry()
    results = {}
    for path in sorted((ROOT / "fixtures").glob("*/*.json")):
        schema = schemas[path.parent.name]
        validator = Draft202012Validator(schema, registry=registry, format_checker=Draft202012Validator.FORMAT_CHECKER)
        data = json.loads(path.read_text(encoding="utf-8"))
        results[f"{path.parent.name}/{path.name}"] = validator.is_valid(data)
    json.dump(results, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
