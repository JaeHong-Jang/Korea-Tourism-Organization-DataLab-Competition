"""세션 사실 요청 전체를 검사한 뒤 원자적으로 적재한다."""

import re
from copy import deepcopy
from pathlib import Path

from knowledge.convert import integrity_problems
from knowledge.convert.claim_lifecycle import publish_problems
from knowledge.convert.definitions import Scope, add_definitions, changes_content
from knowledge.convert.documents import same_content, schema_problems
from knowledge.store.master import MasterCatalog
from knowledge.store.repository import ID, GraphRepository
from knowledge.store.session_graph import build_graph, document_key, read_documents

LOADABLE = {"event", "forecast", "claim", "evidence", "similar-event", "region-baseline"}


# API 계층이 계약 gate-report를 그대로 응답하도록 실패 스냅샷을 담는다.
class IntegrityError(ValueError):
    # 오류 목록과 기존 revision을 보존하며 저장 작업은 하지 않는다.
    def __init__(self, revision: int, master_version: int, violations: list[dict]) -> None:
        self.report = {
            "gate": "integrity",
            "passed": False,
            "revision": revision,
            "masterVersion": master_version,
            "violations": violations,
        }
        super().__init__("; ".join(item["message"] for item in violations))


# 모든 위반에 노드를 붙여 호출자가 문제가 된 사실을 찾게 한다.
def violations_for(node_id: str, problems: list[str]) -> list[dict]:
    return [
        {"check": "integrity", "shapeId": None, "nodeId": node_id, "message": message} for message in problems
    ]


# 적재와 최소 발행 전이가 공유하는 세션 저장 서비스를 제공한다.
class KnowledgeStore:
    # 메모리 저장소는 테스트용이며 운영 앱은 지정 경로를 넘긴다.
    def __init__(self, path: Path | None = None) -> None:
        self.repository = GraphRepository(path)
        self.master = MasterCatalog(self.repository)

    # 허용된 세션 id만 IRI로 만들며 SPARQL 구문 삽입도 막는다.
    def _check_session(self, session_id: str) -> None:
        if not re.fullmatch(r"s-[a-z0-9][a-z0-9_.:-]{1,120}", session_id):
            raise IntegrityError(0, self.master.snapshot()[0], violations_for(session_id, ["잘못된 세션 id"]))

    # 현재 세션 범위는 매번 저장된 named graph에서 읽는다.
    def scope(self, session_id: str) -> Scope:
        self._check_session(session_id)
        with self.repository.session_lock(session_id):
            return read_documents(self.repository.read_graph(ID[session_id]), session_id)[1]

    # 요청 전체가 성공해야 사실과 내용 revision을 함께 반영한다.
    def load_facts(self, session_id: str, schema: str, items: list[dict]) -> int:
        self._check_session(session_id)
        with self.repository.session_lock(session_id), self.repository.master_lock:
            graph = self.repository.read_graph(ID[session_id])
            records, scope = read_documents(graph, session_id)
            revision = scope["revision"]
            version, master = self.master.snapshot()
            violations = []
            if schema not in LOADABLE or not isinstance(items, list) or not items:
                raise IntegrityError(revision, version, violations_for(session_id, ["잘못된 facts 요청"]))

            # 잘못된 스키마 입력은 무결성 검사와 RDF 처리에 넘기지 않는다.
            for item in items:
                node_id = item.get("id", session_id) if isinstance(item, dict) else session_id
                if not isinstance(node_id, str):
                    node_id = session_id
                violations.extend(violations_for(node_id, schema_problems(item, schema)))
            if violations:
                raise IntegrityError(revision, version, violations)

            # 앞선 항목을 임시 범위에만 추가하고 전체 요청의 revision 증가는 한 번으로 묶는다.
            changed = False
            documents = {document_key(record["schema"], record["doc"]): record for record in records}
            for item in items:
                problems = integrity_problems(item, schema, master, scope)
                violations.extend(violations_for(item.get("id", session_id), problems))
                new_content = changes_content(scope, schema, item)
                transition = schema == "claim" and not same_content(scope["claims"].get(item["id"]), item)
                changed = new_content or changed
                if new_content or transition:
                    documents[document_key(schema, item)] = {"schema": schema, "doc": deepcopy(item)}
                add_definitions(scope, schema, item)
            if violations:
                raise IntegrityError(revision, version, violations)

            # 같은 내용 재시도는 RDF의 빈 노드까지 그대로 둔다.
            current = list(documents.values())
            if same_content(records, current):
                return revision
            next_revision = revision + int(changed)
            replacement = build_graph(session_id, current, next_revision)
            self.repository.replace_graph(ID[session_id], replacement)
            return next_revision

    # T-601 순서 검사용 내부 전이이며 HTTP 발행 게이트는 T-602에서 구현한다.
    def publish(self, session_id: str, claim_ids: list[str]) -> int:
        self._check_session(session_id)
        with self.repository.session_lock(session_id), self.repository.master_lock:
            records, scope = read_documents(self.repository.read_graph(ID[session_id]), session_id)
            revision = scope["revision"]
            violations = []
            for claim_id in claim_ids:
                violations.extend(
                    violations_for(claim_id, publish_problems(scope["claims"].get(claim_id), revision))
                )
            if violations:
                raise IntegrityError(revision, self.master.snapshot()[0], violations)
            for record in records:
                if record["schema"] == "claim" and record["doc"]["id"] in claim_ids:
                    record["doc"]["status"] = "published"
            self.repository.replace_graph(ID[session_id], build_graph(session_id, records, revision))
            return revision
