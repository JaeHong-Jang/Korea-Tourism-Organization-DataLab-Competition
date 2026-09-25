"""develop의 근거 그래프를 메모리로 띄워 조회 API 근거의 적재 호환성을 확인한다."""

import json
import os
import subprocess
import sys

import polars as pl
import pytest
from crowdcast import paths
from fastapi.testclient import TestClient

DEVELOP_SOURCE = paths.DATA_ROOT / "services/knowledge/src"

# 별도 프로세스로 develop 패키지를 우선하고 공유 Oxigraph 저장소는 열지 않는다.
LOAD_FACTS = """
import json
import sys
from fastapi.testclient import TestClient
from knowledge.api.app import create_app
from knowledge.store.facts import KnowledgeStore

documents = json.load(sys.stdin)
with TestClient(create_app(KnowledgeStore())) as client:
    for schema, items in documents:
        response = client.post('/v1/sessions/s-t204-lookups/facts', json={'schema': schema, 'items': items})
        if response.status_code != 200:
            print(response.status_code, response.text)
            sys.exit(1)
print('region-baseline, similar-event /facts: 200; 422 없음')
"""


# 이 검사는 조회 근거만 다루며 미구현 예측 응답의 S08·S09 통과를 주장하지 않는다.
def test_lookup_facts_on_develop(
    client: TestClient,
    region_data: pl.DataFrame,
    case_data: tuple,
    event: dict,
) -> None:
    if not (DEVELOP_SOURCE / "knowledge/api/app.py").exists():
        pytest.skip("develop knowledge 소스가 없습니다")
    baseline = client.get("/v1/baseline", params={"sigunguCode": "28110", "before": "2025-10-04"})
    similar = client.post("/v1/similar", json=event)
    assert baseline.status_code == similar.status_code == 200
    documents = [("region-baseline", [baseline.json()]), ("similar-event", similar.json())]
    result = subprocess.run(
        [sys.executable, "-c", LOAD_FACTS],
        input=json.dumps(documents),
        text=True,
        capture_output=True,
        timeout=60,
        env={**os.environ, "PYTHONPATH": str(DEVELOP_SOURCE)},
    )
    assert result.returncode == 0, result.stdout + result.stderr
