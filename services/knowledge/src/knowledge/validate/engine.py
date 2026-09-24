"""고정된 RDF 범위를 pySHACL로 검사하고 계약 위반 목록으로 바꾼다."""

from knowledge.store.repository import ID
from knowledge.validate.shapes import shape_graph
from pyshacl import validate
from rdflib import Graph
from rdflib.namespace import RDF, SH


# 외부 그래프나 추론으로 빠진 사실을 채우지 않고 주어진 스냅샷만 검사한다.
def shacl_violations(graph: Graph, selected: tuple[str, ...]) -> list[dict]:
    shapes, owners = shape_graph(selected)
    conforms, results, _ = validate(
        data_graph=graph,
        shacl_graph=shapes,
        advanced=True,
        inference="none",
        do_owl_imports=False,
        inplace=False,
    )
    if not isinstance(results, Graph):
        raise RuntimeError(f"SHACL 실행 실패: {results}")
    if conforms:
        return []

    # 최상위 결과만 반환해 중첩 제약의 상세 노드가 같은 위반으로 중복되지 않게 한다.
    report = results.value(predicate=RDF.type, object=SH.ValidationReport)
    violations = []
    for result in results.objects(report, SH.result):
        source = results.value(result, SH.sourceShape)
        node = results.value(result, SH.focusNode)
        messages = sorted(str(message) for message in results.objects(result, SH.resultMessage))
        violations.append(
            {
                "check": "shacl",
                "shapeId": owners[source],
                "nodeId": str(node).removeprefix(str(ID)),
                "message": "; ".join(messages) or "SHACL 구조 제약 위반",
            }
        )
    return sorted(violations, key=lambda item: (item["shapeId"], item["nodeId"], item["message"]))
