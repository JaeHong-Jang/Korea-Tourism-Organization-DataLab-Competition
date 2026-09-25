"""기준 그래프의 개체를 한국어 노드와 출처·상태 설명으로 변환한다."""

import orjson
from knowledge.query.graph_labels import PROV_CLASSES, STAGES, literal_text, node_id
from knowledge.store.repository import CC
from rdflib import Graph, URIRef
from rdflib.namespace import DCTERMS, PROV, RDF, RDFS

KINDS = {
    CC.LegalRule: "rule",
    CC.InternalRule: "rule",
    CC.Rule: "rule",
    CC.LegalClause: "clause",
    CC.Dataset: "dataset",
    CC.Assumption: "assumption",
    CC.ModelRun: "model",
    CC.PipelineStage: "stage",
    CC.TeamAgent: "agent",
    PROV.Agent: "agent",
    CC.LineageSnapshot: "other",
}
CATALOG_SECTIONS = {"rule": "rules", "clause": "clauses", "dataset": "datasets"}
GATE_LABELS = {"passed": "통과", "failed": "실패", "unverified": "미검증"}


# 파일은 실제 경로 속성이 있는 계보 자료만 선택해 다른 Entity와 구분한다.
def instance_kind(graph: Graph, subject: URIRef) -> str | None:
    types = set(graph.objects(subject, RDF.type))
    for cls, kind in KINDS.items():
        if cls in types:
            return kind
    if PROV.Entity in types and (subject, CC.filePath, None) in graph:
        return "file"
    return None


# 클래스의 정본 한국어 이름과 로컬 선언이 없는 PROV의 한국어 이름을 사용한다.
def class_node(tbox: Graph, subject: URIRef) -> dict:
    label = literal_text(tbox, subject, RDFS.label) or PROV_CLASSES.get(subject)
    return {"id": node_id(subject), "kind": "class", "label": label or f"클래스 · {node_id(subject)}"}


# 모델 카드만으로 평가 통과를 주장하지 않고 직접 연결된 백테스트 게이트를 확인한다.
def model_note(graph: Graph, subject: URIRef) -> str:
    source = literal_text(graph, subject, CC.sourceDocument)
    card = orjson.loads(source) if source else {}
    gates = sorted(
        {
            GATE_LABELS.get(literal_text(graph, stage, CC.gateResult), "미검증")
            for stage in graph.objects(subject, PROV.wasInformedBy)
            if literal_text(graph, stage, CC.name).rsplit("/", 1)[-1] == "backtest"
        }
    )
    parts = [f"버전: {literal_text(graph, subject, CC.modelVersion)}"]
    parts.append(f"검증: {', '.join(gates) if gates else '미확인(연결된 백테스트 게이트 없음)'}")
    if card.get("backtestRunId"):
        parts.append(f"평가 실행: {card['backtestRunId']}")
    if card.get("trainRange"):
        parts.append(f"학습 기간: {card['trainRange']['from']} ~ {card['trainRange']['to']}")
    if card.get("notes"):
        parts.append(card["notes"])
    return " · ".join(parts)


# 수치·상태는 저장값만 표시하고 미확인·추정·담당자 검토 문구를 보존한다.
def instance_note(graph: Graph, subject: URIRef, kind: str, catalog: dict) -> str:
    parts = []
    if kind == "rule":
        types = set(graph.objects(subject, RDF.type))
        rule_kind = "법정" if CC.LegalRule in types else "자체" if CC.InternalRule in types else "미분류"
        parts.append(f"{rule_kind} 규칙")
        if catalog.get("source"):
            parts.append(catalog["source"])
    elif kind == "assumption":
        for predicate, title in ((CC.value, "값"), (CC.rangeLow, "범위 하한"), (CC.rangeHigh, "범위 상한")):
            value = literal_text(graph, subject, predicate)
            if value:
                parts.append(f"{title}: {value}")
        if literal_text(graph, subject, CC.estimated) == "true":
            parts.append("추정 산식 기반")
    elif kind == "model":
        parts.append(model_note(graph, subject))
    elif kind == "stage":
        result = literal_text(graph, subject, CC.gateResult)
        parts.append(f"게이트: {GATE_LABELS.get(result, '미검증')}")
        for predicate in (CC.name, CC.stageStatus, CC.lastRunId, CC.gateMessage):
            parts.append(literal_text(graph, subject, predicate))
    elif kind == "file":
        parts.append(literal_text(graph, subject, CC.filePath))
        digest = literal_text(graph, subject, CC.sha256)
        parts.append(f"SHA-256: {digest}" if digest else "해시 없음")

    # 가정 출처·자료 메뉴·원문 설명은 종류별 보조 정보 뒤에 그대로 붙인다.
    for predicate in (CC.basis, CC.datalabMenu, CC.note, CC.exportedAt):
        parts.append(literal_text(graph, subject, predicate))
    return " · ".join(part for part in parts if part)


# 계약 라벨을 우선하고 동적 모델·단계·파일에도 한국어 종류 이름을 붙인다.
def instance_node(graph: Graph, subject: URIRef, kind: str, labels: dict) -> dict:
    identifier = node_id(subject)
    catalog = labels.get(CATALOG_SECTIONS.get(kind, ""), {}).get(identifier, {})
    label = catalog.get("title") or literal_text(graph, subject, RDFS.label)
    label = label or literal_text(graph, subject, DCTERMS.title)
    if not label:
        if kind == "stage":
            name = literal_text(graph, subject, CC.name)
            label = STAGES.get(name.rsplit("/", 1)[-1], f"파이프라인 단계 · {name}")
        elif kind == "file":
            label = f"파일 · {literal_text(graph, subject, CC.filePath)}"
        elif kind == "model":
            label = f"모델 학습 · {literal_text(graph, subject, CC.modelVersion)}"
        else:
            label = "계보 스냅샷" if kind == "other" else f"기준 항목 · {identifier}"
    result = {"id": identifier, "kind": kind, "label": label}
    note = instance_note(graph, subject, kind, catalog)
    url = catalog.get("url") or literal_text(graph, subject, CC.accessUrl)
    if note:
        result["note"] = note
    if url:
        result["url"] = url
    return result
