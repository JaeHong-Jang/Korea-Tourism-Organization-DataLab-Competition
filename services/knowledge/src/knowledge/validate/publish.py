"""전체 SHACL 규칙과 계약 수명 주기를 통과한 후보를 한 트랜잭션으로 발행한다."""

from knowledge.convert.claim_lifecycle import publish_problems
from knowledge.store.facts import KnowledgeStore, violations_for
from knowledge.store.repository import ID
from knowledge.store.session_graph import build_graph
from knowledge.validate.engine import shacl_violations
from knowledge.validate.shapes import SHAPE_IDS
from knowledge.validate.snapshot import locked_snapshot


# 발행 직전 검사를 잠금 안에서 실행해 검증과 상태 전이 사이의 쓰기를 막는다.
def publish_session(store: KnowledgeStore, session_id: str, revision: int, master_version: int) -> dict:
    with locked_snapshot(store, session_id, revision, master_version, "publish") as snapshot:
        claims = [record["doc"] for record in snapshot.records if record["schema"] == "claim"]
        candidates = [claim for claim in claims if claim["status"] == "candidate"]
        violations = shacl_violations(snapshot.graph, SHAPE_IDS)
        for claim in candidates:
            violations.extend(violations_for(claim["id"], publish_problems(claim, snapshot.revision)))

        # 후보가 없으면 draft·published·rejected를 발행한 것처럼 성공시키지 않는다.
        if not candidates:
            for claim in claims:
                violations.extend(violations_for(claim["id"], publish_problems(claim, snapshot.revision)))
            if not claims:
                violations.extend(violations_for(session_id, ["발행할 후보 문장이 없다"]))
        if violations:
            return snapshot.report("publish", violations)

        # 내용 revision은 유지하고 RDF 상태와 저장된 원문을 함께 교체한다.
        for claim in candidates:
            claim["status"] = "published"
        replacement = build_graph(session_id, snapshot.records, snapshot.revision)
        store.repository.replace_graph(ID[session_id], replacement)
        return snapshot.report("publish", [])
