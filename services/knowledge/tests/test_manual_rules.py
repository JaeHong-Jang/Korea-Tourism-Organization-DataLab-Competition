"""매뉴얼 계획 규칙의 자체 분류·출처·기존 저장소 동기화와 권고 발행을 검증한다."""

import pytest
from contract_cases import RDFLIB_NQUADS_WARNING, SESSION_ID, memory_store, read_json
from knowledge.paths import CONTRACTS, JSONLD
from knowledge.store.master import MasterCatalog
from knowledge.store.repository import CC, ID, MASTER
from knowledge.validate.engine import shacl_violations
from knowledge.validate.publish import publish_session
from knowledge.validate.shapes import SHAPE_IDS
from rdflib.namespace import DCTERMS, RDF
from shape_cases import validation_graph

MANUAL_RULES = {
    "rule-check-staff-plan": "p.26·p.138",
    "rule-check-staff-distinct": "p.26",
    "rule-check-staff-focus": "p.46·p.49~50",
    "rule-check-org-chart": "표준안 p.137",
    "rule-check-org-hq": "표준안 p.142",
    "rule-check-capacity": "표준안 p.134",
}
pytestmark = pytest.mark.filterwarnings(RDFLIB_NQUADS_WARNING)


# 여섯 규칙 모두 자체 기준이며 문서·쪽수·주소를 라벨까지 손실 없이 전달한다.
def test_manual_master_sources_and_kinds() -> None:
    store = memory_store()
    graph = store.repository.read_graph(MASTER)
    labels = read_json(JSONLD / "master-labels.json")["rules"]
    for rule_id, pages in MANUAL_RULES.items():
        node = ID[rule_id]
        assert (node, RDF.type, CC.InternalRule) in graph
        assert (node, RDF.type, CC.LegalRule) not in graph
        assert graph.value(node, CC.basedOnClause) is None
        source = str(graph.value(node, DCTERMS.source))
        assert "행정안전부 「지역축제장 안전관리 매뉴얼」(2024. 9.)" in source
        assert pages in source and "nttId=113047" in source
        assert labels[rule_id]["source"] == source
        assert labels[rule_id]["title"] == str(graph.value(node, DCTERMS.title))
        assert labels[rule_id]["kind"] == "자체" and labels[rule_id]["clauseId"] is None
        assert "등급 2 이상" in str(graph.value(node, CC.note))
    assert "1㎡당 4인 이하 권고" in str(graph.value(ID["rule-check-capacity"], CC.note))
    assert "source" not in labels["rule-check-vehicle"]


# 이미 운영 중인 기준 그래프에도 새 규칙 여섯 개가 한 번만 추가된다.
def test_manual_rules_sync_into_existing_master() -> None:
    store = memory_store()
    graph = store.repository.read_graph(MASTER)
    for rule_id in MANUAL_RULES:
        graph.remove((ID[rule_id], None, None))
    previous = set(graph.triples((ID["rule-check-vehicle"], None, None)))
    store.repository.replace_graph(MASTER, graph)
    before = store.master.snapshot()[0]
    MasterCatalog(store.repository)
    version, sets = store.master.snapshot()
    assert MANUAL_RULES.keys() <= sets["rules"] and version == before + 1
    MasterCatalog(store.repository)
    assert store.master.snapshot()[0] == version
    restored = store.repository.read_graph(MASTER)
    assert previous == set(restored.triples((ID["rule-check-vehicle"], None, None)))


# 자체 규칙 근거에 연결된 후보 권고가 전체 SHACL과 실제 발행 경로를 통과한다.
def test_manual_recommendations_pass_shacl_and_publish() -> None:
    store = memory_store()
    event = read_json(CONTRACTS / "fixtures/event/valid-yeongjong.json")
    forecast = read_json(CONTRACTS / "fixtures/forecast/valid-yeongjong.json")
    template = read_json(CONTRACTS / "fixtures/claim/valid-published.json")
    labels = read_json(JSONLD / "master-labels.json")["rules"]
    base = next(item for item in forecast["evidence"] if item["kind"] == "rule")
    claims = []
    for rule_id in MANUAL_RULES:
        label = labels[rule_id]
        evidence_id = f"ev-yeongjong-{rule_id}"
        forecast["evidence"].append(
            {
                **base,
                "id": evidence_id,
                "ruleId": rule_id,
                "clauseId": None,
                "quantityIds": [],
                "title": label["title"],
                "summary": f"자체 기준 — {label['title']} 출처: {label['source']}",
            }
        )
        forecast["judgment"]["checklist"].append(
            {
                "id": f"ck-{rule_id.removeprefix('rule-check-')}",
                "ruleId": rule_id,
                "text": label["title"],
                "evidenceIds": [evidence_id],
            }
        )
        claims.append(
            {
                **template,
                "id": f"c-yeongjong-{rule_id}",
                "claimType": "권고",
                "text": label["title"],
                "rendered": None,
                "status": "draft",
                "placeholders": [],
                "evidenceIds": [evidence_id],
                "checks": [],
            }
        )

    # 내용 revision을 확정한 뒤 해당 revision의 검사만 붙여 후보 상태로 전이한다.
    store.load_facts(SESSION_ID, "event", [event])
    store.load_facts(SESSION_ID, "forecast", [forecast])
    revision = store.load_facts(SESSION_ID, "claim", claims)
    for claim in claims:
        claim.update(
            status="candidate",
            rendered=claim["text"],
            checks=[
                {"checkKind": kind, "passed": True, "revision": revision}
                for kind in ("evidence", "number", "rule", "uncertainty")
            ],
        )
    assert store.load_facts(SESSION_ID, "claim", claims) == revision
    assert shacl_violations(validation_graph(store), SHAPE_IDS) == []
    gate = publish_session(store, SESSION_ID, revision, store.master.snapshot()[0])
    assert gate["passed"] and gate["violations"] == []
    assert all(claim["status"] == "published" for claim in store.scope(SESSION_ID)["claims"].values())
