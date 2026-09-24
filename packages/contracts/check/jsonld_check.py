"""계약 JSON을 types.json 규칙과 JSON-LD 컨텍스트로 RDF로 바꿔, 근거 그래프 검사(S01~S12)에 필요한 트리플이 나오는지 확인한다."""
import json
import sys
from pathlib import Path

from pyld import jsonld
from rdflib import Graph, Literal, URIRef
from rdflib.namespace import RDF, XSD

ROOT = Path(__file__).resolve().parents[1]
BASE = "http://crowdcast.local/id/"
PREFIXES = {"cc": "http://crowdcast.local/ont#", "prov": "http://www.w3.org/ns/prov#", "cito": "http://purl.org/spar/cito/",
            "dcterms": "http://purl.org/dc/terms/", "xsd": str(XSD), "rdf": str(RDF)}


# 경로("a.b[]" 형식)에 있는 객체마다 @type을 붙인다
def apply_types(obj, path: str, cls: str) -> None:
    if path == "":
        obj.setdefault("@type", cls)
        return
    head, _, rest = path.partition(".")
    key, many = (head[:-2], True) if head.endswith("[]") else (head, False)
    value = obj.get(key)
    targets = value if many and isinstance(value, list) else [value]
    for t in targets:
        if isinstance(t, dict):
            apply_types(t, rest, cls)


# 스키마 이름별 규칙(다른 규칙을 끌어오는 @include 포함)을 적용한다
def typed(obj, schema: str, rules: dict):
    obj = json.loads(json.dumps(obj))
    spec = rules.get(schema, {})
    for path, cls in spec.items():
        if path == "@include":
            for sub_path, sub_schema in cls.items():
                key, many = (sub_path[:-2], True) if sub_path.endswith("[]") else (sub_path, False)
                if many:
                    obj[key] = [typed(x, sub_schema, rules) for x in obj.get(key, [])]
                elif isinstance(obj.get(key), dict):
                    obj[key] = typed(obj[key], sub_schema, rules)
        else:
            apply_types(obj, path, cls)
    return obj


# JSON-LD를 표준 처리기(pyld)로 N-Quads로 바꾼 뒤 rdflib 그래프로 읽는다
def to_graph(obj, context) -> Graph:
    doc = {"@context": context["@context"], **obj}
    nquads = jsonld.to_rdf(doc, {"format": "application/n-quads", "base": BASE})
    g = Graph()
    g.parse(data=nquads, format="nquads")
    return g


# 기대 트리플의 각 칸을 rdflib 용어로 바꾼다("*"는 아무 주어)
def term(text: str):
    if text == "*":
        return None
    if text.startswith('"'):
        lex, _, dtype = text[1:].partition('"^^')
        if dtype:
            p, local = dtype.split(":", 1)
            return Literal(lex, datatype=URIRef(PREFIXES[p] + local))
        return Literal(lex.rstrip('"'))
    if ":" in text and text.split(":", 1)[0] in PREFIXES:
        p, local = text.split(":", 1)
        return URIRef(PREFIXES[p] + local)
    return URIRef(BASE + text)


def main() -> int:
    context = json.loads((ROOT / "jsonld" / "context.jsonld").read_text(encoding="utf-8"))
    rules = json.loads((ROOT / "jsonld" / "types.json").read_text(encoding="utf-8"))
    report, failed = [], 0
    for exp_path in sorted((ROOT / "jsonld" / "expected").glob("*.json")):
        exp = json.loads(exp_path.read_text(encoding="utf-8"))
        data = json.loads((ROOT / exp["fixture"]).read_text(encoding="utf-8"))
        g = to_graph(typed(data, exp["schema"], rules), context)
        missing = [t for t in exp["triples"] if not any(True for _ in g.triples(tuple(term(x) for x in t)))]
        failed += len(missing)
        report.append({"expected": exp_path.name, "triples": len(g), "checked": len(exp["triples"]), "missing": missing})
    json.dump(report, sys.stdout, ensure_ascii=False)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
