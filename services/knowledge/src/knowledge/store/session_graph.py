"""세션 RDF에 현재 계약 문서와 내용 revision을 함께 보관한다."""

import orjson
from knowledge.convert import json_to_graph
from knowledge.convert.definitions import Scope, baseline_key, session_scope
from knowledge.store.repository import CC, ID
from rdflib import BNode, Graph, Literal
from rdflib.namespace import RDF, XSD


# RDF 변환에서 생략되는 null·배열 순서도 원문으로 보존해 충돌 판정에 쓴다.
def read_documents(graph: Graph, session_id: str) -> tuple[list[dict], Scope]:
    subject = ID[session_id]
    records = []
    nodes = sorted(
        graph.objects(subject, CC.loadedDocument), key=lambda n: int(graph.value(n, CC.documentOrder))
    )
    for node in nodes:
        records.append(
            {
                "schema": str(graph.value(node, CC.documentSchema)),
                "doc": orjson.loads(str(graph.value(node, CC.sourceDocument))),
            }
        )
    revision = int(graph.value(subject, CC.revision) or 0)
    scope = session_scope(session_id, records, revision)
    scope["conflicts"] = []
    return records, scope


# 자체 id가 없는 평시와 사례도 다시 적재할 때 같은 문서를 찾는다.
def document_key(schema: str, doc: dict) -> tuple[str, str]:
    if schema == "region-baseline":
        return schema, baseline_key(doc)
    if schema == "similar-event":
        return schema, doc["eventId"]
    return schema, doc["id"]


# 현재 문서만 다시 조립하므로 문장 전이 후 이전 상태와 검사 빈 노드가 남지 않는다.
def build_graph(session_id: str, records: list[dict], revision: int) -> Graph:
    graph = Graph(identifier=ID[session_id])
    subject = ID[session_id]
    graph.add((subject, RDF.type, CC.Session))
    graph.add((subject, CC.revision, Literal(revision, datatype=XSD.integer)))
    for order, record in enumerate(records):
        graph += json_to_graph(record["doc"], record["schema"])
        node = BNode()
        graph.add((subject, CC.loadedDocument, node))
        graph.add((node, CC.documentOrder, Literal(order, datatype=XSD.integer)))
        graph.add((node, CC.documentSchema, Literal(record["schema"])))
        graph.add((node, CC.sourceDocument, Literal(orjson.dumps(record["doc"]).decode(), datatype=RDF.JSON)))
    return graph
