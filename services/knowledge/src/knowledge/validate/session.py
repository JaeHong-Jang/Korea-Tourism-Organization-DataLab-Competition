"""선택한 SHACL 규칙으로 현재 세션의 고정 범위를 검증한다."""

from knowledge.store.facts import KnowledgeStore
from knowledge.validate.engine import shacl_violations
from knowledge.validate.shapes import gate_for
from knowledge.validate.snapshot import locked_snapshot


# 규칙 검사와 보고서 생성이 끝날 때까지 내용 및 기준 버전을 고정한다.
def validate_session(
    store: KnowledgeStore,
    session_id: str,
    revision: int,
    master_version: int,
    selected: tuple[str, ...],
) -> dict:
    gate = gate_for(selected)
    with locked_snapshot(store, session_id, revision, master_version, gate) as snapshot:
        return snapshot.report(gate, shacl_violations(snapshot.graph, selected))
