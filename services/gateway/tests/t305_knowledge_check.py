"""최초 발행과 반복 후속 설명의 실제 요청을 메모리 knowledge에서 순서대로 검증한다."""

import json
import sys
from pathlib import Path

from knowledge.paths import CONTRACTS
from knowledge.store.facts import KnowledgeStore
from knowledge.validate.publish import publish_session
from knowledge.validate.session import validate_session


# 공유 저장소 없이 실제 상태 전이와 SHACL을 적용해 재발행 가능 여부를 확인한다.
def verify(data: dict) -> list[dict]:
    store = KnowledgeStore()
    for card in sorted((CONTRACTS / "fixtures/model-card").glob("valid-*.json")):
        store.master.register_model_run(json.loads(card.read_text()))
    revision = 0
    results = []

    # 발행 시점을 보존해야 뒤따르는 초안 적재가 published 문장을 건드리지 않는지 알 수 있다.
    for call in data["calls"]:
        if call.get("failed"):
            continue
        if call["action"] == "facts":
            facts = call["body"]
            revision = store.load_facts(data["sessionId"], facts["schema"], facts["items"])
            continue
        version = store.master.snapshot()[0]
        if call["action"] == "publish":
            result = publish_session(store, data["sessionId"], revision, version)
        else:
            result = validate_session(store, data["sessionId"], revision, version, tuple(call["shapes"].split(",")))
        results.append(result)
        if not result["passed"]:
            break
    assert all(claim["status"] != "candidate" for claim in store.scope(data["sessionId"])["claims"].values())
    return results


# 주입한 실패를 제외한 최초 발행·후속 요청의 검증과 발행이 모두 승인되어야 성공한다.
if __name__ == "__main__":
    data = json.loads(Path(sys.argv[1]).read_text())
    results = verify(data)
    print(json.dumps(results, ensure_ascii=False, indent=2))
    sys.exit(0 if len(results) == data.get("expectedGates", 7) and all(item["passed"] for item in results) else 1)
