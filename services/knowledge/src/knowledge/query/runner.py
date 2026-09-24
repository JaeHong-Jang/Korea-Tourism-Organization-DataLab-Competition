"""허용된 화면용 SPARQL을 한 세션과 기준 그래프 안에서만 실행한다."""

import re
from dataclasses import dataclass
from functools import cache

from knowledge.paths import ONTOLOGY
from knowledge.store.repository import ID, MASTER, GraphRepository
from pyoxigraph import BlankNode, Literal, NamedNode, Variable

QUERY_BINDINGS = {
    "claim_evidence": {"claim", "evidence"},
    "forecast_lineage": {"forecast"},
    "datalab_usage": set(),
    "rule_trace": {"forecast"},
    "session_summary": {"session", "claim", "step", "agent"},
}


# 저장소와 세션을 명시해 전역 그래프 합집합을 조회 범위로 쓰지 않는다.
@dataclass(frozen=True)
class QueryScope:
    repository: GraphRepository
    session_id: str

    # 적재와 같은 세션 식별 규칙을 적용한다.
    def __post_init__(self) -> None:
        if not re.fullmatch(r"s-[a-z0-9][a-z0-9_.:-]{1,120}", self.session_id):
            raise ValueError("잘못된 세션 id")


# 파일명은 고정 목록에서만 선택해 임의 질의·경로 접근을 막는다.
@cache
def query_text(name: str) -> str:
    if name not in QUERY_BINDINGS:
        raise ValueError("지원하지 않는 질의")
    return (ONTOLOGY / "queries" / f"{name}.rq").read_text(encoding="utf-8")


# SELECT 값은 JSON에도 쓸 수 있는 기본 타입으로 바꾸고 미결합은 None으로 둔다.
def result_value(term: NamedNode | BlankNode | Literal | None) -> str | int | float | bool | None:
    if term is None:
        return None
    if isinstance(term, NamedNode):
        return term.value.removeprefix(str(ID))
    if isinstance(term, BlankNode):
        return f"_:{term.value}"
    datatype = term.datatype.value.rsplit("#", 1)[-1]
    if datatype == "boolean":
        return term.value in {"true", "1"}
    if datatype == "integer":
        return int(term.value)
    if datatype in {"decimal", "double", "float"}:
        return float(term.value)
    return term.value


# 문자열 보간 대신 RDF 항 치환을 쓰고 결과를 잠금 안에서 모두 읽는다.
def run(name: str, bindings: dict[str, str | NamedNode], scope: QueryScope) -> list[dict]:
    query = query_text(name)
    if bindings.keys() - QUERY_BINDINGS[name]:
        raise ValueError("지원하지 않는 질의 바인딩")
    substitutions = {
        Variable(key): value if isinstance(value, NamedNode) else NamedNode(str(ID[value]))
        for key, value in bindings.items()
    }
    repository = scope.repository
    with repository.session_lock(scope.session_id), repository.master_lock:
        session, master = NamedNode(str(ID[scope.session_id])), NamedNode(str(MASTER))
        rows = repository.store.query(
            query,
            default_graph=[session],
            named_graphs=[master, session] if name == "datalab_usage" else [master],
            substitutions=substitutions,
        )
        return [{variable.value: result_value(row[variable]) for variable in rows.variables} for row in rows]
