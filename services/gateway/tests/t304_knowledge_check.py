"""게이트웨이가 실제 전송한 사실 요청을 메모리 knowledge에 적재하고 SHACL로 재검증한다."""

import json
import sys
from pathlib import Path

from knowledge.paths import CONTRACTS
from knowledge.store.facts import KnowledgeStore
from knowledge.validate.publish import publish_session
from knowledge.validate.session import validate_session


# 등록된 계약 모델 카드와 실제 서비스 저장 코드를 사용하며 공유 저장소는 열지 않는다.
def verify(path: Path) -> dict:
    data = json.loads(path.read_text())
    store = KnowledgeStore()
    for card in sorted((CONTRACTS / "fixtures/model-card").glob("valid-*.json")):
        store.master.register_model_run(json.loads(card.read_text()))
    revision = 0
    for facts in data["facts"]:
        revision = store.load_facts(data["sessionId"], facts["schema"], facts["items"])

    # 코드가 남긴 검사를 수정하지 않고 현재 내용 revision과 실제 SHACL을 대조한다.
    version = store.master.snapshot()[0]
    gate = validate_session(store, data["sessionId"], revision, version, ("S01", "S02", "S10", "S11", "S12"))
    published = publish_session(store, data["sessionId"], revision, version)
    return {"gateB": gate, "publish": published}


# 입력 경로만 인자로 받고 위반이 하나라도 있으면 실패 종료한다.
if __name__ == "__main__":
    result = verify(Path(sys.argv[1]))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(0 if all(item["passed"] for item in result.values()) else 1)
