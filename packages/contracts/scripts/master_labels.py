"""knowledge 기준 그래프 TTL에서 화면용 조항·규칙·데이터셋 이름표를 뽑아 jsonld/master-labels.json으로 쓴다."""

import json
import sys
from pathlib import Path

from rdflib import Graph, Namespace
from rdflib.namespace import DCTERMS, RDF

ROOT = Path(__file__).resolve().parents[3]
MASTER = ROOT / "services/knowledge/ontology/master"
OUT = ROOT / "packages/contracts/jsonld/master-labels.json"
CC = Namespace("http://crowdcast.local/ont#")
ID = "http://crowdcast.local/id/"


# 식별자 IRI에서 계약 id만 남긴다.
def short(node) -> str:
    return str(node).removeprefix(ID)


# 기준 그래프 전체를 읽어 종류별로 제목·출처·원문 주소·법정/자체 구분을 모은다.
def labels() -> dict:
    graph = Graph()
    for path in sorted(MASTER.glob("*.ttl")):
        graph.parse(path)
    out = {"note": "services/knowledge/ontology/master/*.ttl에서 생성 — 손으로 고치지 않는다(scripts/master_labels.py)",
           "clauses": {}, "rules": {}, "datasets": {}}
    for node in sorted(graph.subjects(RDF.type, CC.LegalClause)):
        out["clauses"][short(node)] = {
            "title": str(graph.value(node, DCTERMS.title) or ""),
            "publisher": str(graph.value(node, DCTERMS.publisher) or "") or None,
            "url": str(graph.value(node, CC.accessUrl) or "") or None,
        }
    # 법정 규칙(LegalRule)과 자체 규칙(InternalRule)을 판정 문구의 법정/자체 구분 그대로 옮긴다.
    for rule_class, kind in ((CC.LegalRule, "법정"), (CC.InternalRule, "자체")):
        for node in sorted(graph.subjects(RDF.type, rule_class)):
            clause = graph.value(node, CC.basedOnClause)
            out["rules"][short(node)] = {
                "title": str(graph.value(node, DCTERMS.title) or ""),
                "kind": kind,
                "clauseId": short(clause) if clause else None,
            }
            # 매뉴얼 근거가 있는 규칙에만 문서 제목·쪽수·주소를 그대로 전달한다.
            source = graph.value(node, DCTERMS.source)
            if source is not None:
                out["rules"][short(node)]["source"] = str(source)
    for node in sorted(graph.subjects(RDF.type, CC.Dataset)):
        out["datasets"][short(node)] = {
            "title": str(graph.value(node, DCTERMS.title) or ""),
            "url": str(graph.value(node, CC.accessUrl) or "") or None,
        }
    return out


# --check면 파일이 TTL과 같은지만 확인한다(다르면 1).
if __name__ == "__main__":
    text = json.dumps(labels(), ensure_ascii=False, indent=2) + "\n"
    if "--check" in sys.argv:
        sys.exit(0 if OUT.exists() and OUT.read_text(encoding="utf-8") == text else 1)
    OUT.write_text(text, encoding="utf-8")
    print(f"✓ {OUT.relative_to(ROOT)}")
