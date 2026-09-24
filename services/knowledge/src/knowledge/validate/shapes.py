"""검사할 규칙 목록과 게이트 구분을 정하고 로컬 SHACL 그래프를 읽는다."""

from functools import lru_cache

from knowledge.paths import ONTOLOGY
from rdflib import Graph
from rdflib.term import Node

SHAPE_IDS = tuple(f"S{number:02}" for number in range(1, 13))
ANALYSIS_SHAPES = frozenset({"S03", "S04", "S05", "S06", "S07", "S08", "S09"})


# 생략하면 전체 규칙을 검사하고 쉼표 목록의 오타·빈 항목은 거부한다.
def select_shapes(value: str | None) -> tuple[str, ...]:
    if value is None:
        return SHAPE_IDS
    selected = {item.strip() for item in value.split(",")}
    if not selected or not selected.issubset(SHAPE_IDS):
        raise ValueError("shapes는 S01~S12를 쉼표로 구분한 목록이어야 한다")
    return tuple(shape_id for shape_id in SHAPE_IDS if shape_id in selected)


# 분석 규칙만이면 A, S12만이면 발행 검사, 문장·전체 검사이면 B로 응답한다.
def gate_for(selected: tuple[str, ...]) -> str:
    if selected == ("S12",):
        return "publish"
    return "A" if set(selected).issubset(ANALYSIS_SHAPES) else "B"


# 파일별 빈 노드까지 규칙 ID에 매핑해 중첩 제약 실패도 원래 규칙을 보고한다.
@lru_cache(maxsize=64)
def shape_graph(selected: tuple[str, ...]) -> tuple[Graph, dict[Node, str]]:
    graph = Graph()
    owners = {}
    for shape_id in selected:
        paths = list((ONTOLOGY / "shapes").glob(f"{shape_id.lower()}-*.ttl"))
        if len(paths) != 1:
            raise RuntimeError(f"규칙 {shape_id} 파일이 정확히 하나여야 한다")
        part = Graph().parse(paths[0], format="turtle")
        owners.update((subject, shape_id) for subject in part.subjects())
        graph += part
    return graph, owners
