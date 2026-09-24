"""테스트에서 계약 정본과 실제 메모리 저장소를 준비한다."""

from pathlib import Path

import orjson
from knowledge.paths import CONTRACTS
from knowledge.store.facts import KnowledgeStore

INTEGRITY = CONTRACTS / "fixtures-integrity"
SESSION_ID = "s-demo-0001"

# rdflib N-Quads 파서 내부 경고만 걸러 해당 변환을 실행하는 테스트에 개별 적용한다.
RDFLIB_NQUADS_WARNING = (
    r"ignore:^Dataset\.default_context is deprecated, use Dataset\.default_graph instead\.$"
    r":DeprecationWarning:^rdflib\.plugins\.parsers\.nquads$"
)


# 픽스처를 매번 새 객체로 읽어 테스트 사이의 변경이 전파되지 않게 한다.
def read_json(path: Path | str) -> dict:
    return orjson.loads(Path(path).read_bytes())


# 모델 카드도 저장소의 등록 경로를 거쳐 실제 기준 그래프에 넣는다.
def memory_store() -> KnowledgeStore:
    store = KnowledgeStore()
    for path in sorted((CONTRACTS / "fixtures/model-card").glob("valid-*.json")):
        store.master.register_model_run(read_json(path))
    return store


# 검사할 종류보다 앞선 문서를 명시된 순서대로 실제 세션 그래프에 적재한다.
def load_before(store: KnowledgeStore, schema: str) -> list[dict]:
    loaded = []
    if schema == "forecast-report":
        return loaded
    for kind, fixture in read_json(INTEGRITY / "session-scope.json")["loadOrder"]:
        if kind == schema:
            break
        if fixture:
            doc = read_json(CONTRACTS / fixture)
            store.load_facts(SESSION_ID, kind, [doc])
            loaded.append({"schema": kind, "doc": doc})
    return loaded
