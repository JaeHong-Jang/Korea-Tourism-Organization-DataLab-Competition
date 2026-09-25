"""실제 계보·모델 카드 사본을 테스트 전용 데이터 루트에 준비한다."""

from pathlib import Path

import orjson
from knowledge import paths
from knowledge.store.facts import KnowledgeStore

FIXTURES = Path(__file__).parent / "fixtures/lineage"


# 실제 파일 바이트를 유지해 계보에 기록된 모델 카드 SHA-256도 그대로 검증한다.
def runtime_files() -> tuple[Path, dict]:
    card_bytes = (FIXTURES / "model_card.json").read_bytes()
    card = orjson.loads(card_bytes)
    model_path = paths.DATA_ROOT / "models" / card["modelVersion"] / "model_card.json"
    model_path.parent.mkdir(parents=True, exist_ok=True)
    model_path.write_bytes(card_bytes)
    pointer = paths.DATA_ROOT / "reports/backtest/promoted.json"
    pointer.parent.mkdir(parents=True, exist_ok=True)
    pointer.write_bytes(orjson.dumps({"modelVersion": card["modelVersion"]}))
    lineage = paths.DATA_ROOT / "reports/runs/lineage.json"
    lineage.parent.mkdir(parents=True, exist_ok=True)
    lineage.write_bytes((FIXTURES / "lineage.json").read_bytes())
    return lineage, card


# 메모리 저장소에 모델 카드를 먼저 등록해 실제 기동 순서를 재현한다.
def prepared_store() -> tuple[KnowledgeStore, Path, dict]:
    lineage, card = runtime_files()
    store = KnowledgeStore()
    store.master.register_model_run(card)
    return store, lineage, card
