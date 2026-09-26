"""통계 테스트에서 발행 세 문장과 미발행 한 문장을 실제 적재한다."""

from copy import deepcopy

from contract_cases import SESSION_ID, read_json
from fastapi.testclient import TestClient
from knowledge.api.app import create_app
from knowledge.paths import CONTRACTS
from knowledge.store.facts import KnowledgeStore
from query_cases import add_claim, load_sequence, publish_session, sequence


# 직접 데이터랩·비데이터랩·모델 계보·미발행 전용 근거를 함께 준비한다.
def mixed_published_session(store: KnowledgeStore) -> None:
    case = sequence()
    case["steps"] = case["steps"][:4]
    load_sequence(store, case=case, publish=False)
    baseline = read_json(CONTRACTS / "fixtures/evidence/valid-data.json")
    tourapi = deepcopy(baseline)
    tourapi.update(id="ev-yeongjong-tourapi", title="영종 축제 관광정보")
    tourapi["source"].update(datasetId="ds-kto-tourapi-15101578", title="국문 관광정보", datalabMenu=None)
    hidden = deepcopy(baseline)
    hidden.update(id="ev-yeongjong-candidate", title="영종 관광지 집중률 검토")
    hidden["source"]["datasetId"] = "ds-kto-concentration-15128555"
    store.load_facts(SESSION_ID, "evidence", [tourapi, hidden])

    # 같은 근거의 반복 인용과 미인용 사례 근거가 합계를 늘리지 않는지 확인한다.
    claims = [
        add_claim(store, [baseline["id"], tourapi["id"]], "c-yeongjong-direct"),
        add_claim(store, [tourapi["id"]], "c-yeongjong-tourapi"),
        add_claim(store, ["ev-model-f-yeongjong-2025", baseline["id"]], "c-yeongjong-lineage"),
    ]
    revision = store.scope(SESSION_ID)["revision"]
    for claim in claims:
        claim["checks"][0]["revision"] = revision
    store.load_facts(SESSION_ID, "claim", claims)
    with TestClient(create_app(store)) as client:
        publish_session(client, store)
    add_claim(store, [hidden["id"]], "c-yeongjong-candidate")
