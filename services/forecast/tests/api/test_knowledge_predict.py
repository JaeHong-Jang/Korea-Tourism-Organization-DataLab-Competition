"""develop knowledge에 예보를 적재하고 게이트 A의 실제 SHACL과 사례 참조를 검사한다."""

import json
import os
import subprocess
import sys
from pathlib import Path

import polars as pl
import pytest
from crowdcast import paths
from fastapi.testclient import TestClient

DEVELOP_SOURCE = paths.DATA_ROOT / "services/knowledge/src"

# 전처리 자료와 저장소를 공유하지 않는 별도 프로세스에서 develop 앱을 띄운다.
VERIFY_FACTS = """
import copy
import json
import sys
from fastapi.testclient import TestClient
from knowledge.api.app import create_app
from knowledge.store.facts import KnowledgeStore

payload = json.load(sys.stdin)
with TestClient(create_app(KnowledgeStore())) as client:
    registered = client.post('/v1/master/model-runs', json=payload['card'])
    assert registered.status_code == 200, registered.text
    master_version = registered.json()['masterVersion']
    results = []
    for schema, items in payload['documents']:
        if not items:
            continue
        loaded = client.post('/v1/sessions/s-t204-predict/facts', json={'schema': schema, 'items': items})
        assert loaded.status_code == 200, loaded.text
        results.append([schema, loaded.status_code])
    report = client.post('/v1/sessions/s-t204-predict/validate', params={
        'revision': loaded.json()['revision'], 'masterVersion': master_version,
        'shapes': 'S03,S05,S06,S07,S08,S09',
    })
    assert report.status_code == 200 and report.json()['passed'], report.text

    # 통과만 확인하지 않고 미래 공개일을 넣으면 S09가 실제로 거부하는지 확인한다.
    documents = copy.deepcopy(payload['documents'])
    for schema, items in documents:
        if not items:
            continue
        if schema == 'forecast':
            items[0]['observations'][0]['availableAt'] = '2099-01-01'
        loaded = client.post('/v1/sessions/s-t204-future/facts', json={'schema': schema, 'items': items})
        assert loaded.status_code == 200, loaded.text
    rejected = client.post('/v1/sessions/s-t204-future/validate', params={
        'revision': loaded.json()['revision'], 'masterVersion': master_version, 'shapes': 'S09',
    })
    assert rejected.status_code == 200 and not rejected.json()['passed'], rejected.text
print(json.dumps({'facts': results, '422': 0, 'gateA': 'PASS', 'futureObservation': 'rejected'}))
"""


# 표준 적재 순서로 조회 근거의 자연 키·수치 참조를 먼저 등록한 뒤 예보를 넣는다.
@pytest.mark.parametrize("outside_top_five", [False, True])
def test_predict_facts_on_develop(
    client: TestClient, forecast_data: Path, event: dict, tmp_path: Path, outside_top_five: bool
) -> None:
    if not (DEVELOP_SOURCE / "knowledge/api/model_runs.py").exists():
        pytest.skip("develop knowledge 모델 카드 등록 API가 없습니다")
    if outside_top_five:
        pl.read_parquet(paths.PROCESSED / "labels.parquet").with_columns(
            pl.lit(True).alias("is_primary")
        ).write_parquet(paths.PROCESSED / "labels.parquet")
    forecast = client.post("/v1/predict", json=event)
    assert forecast.status_code == 200, forecast.text
    baseline = client.get(
        "/v1/baseline", params={"sigunguCode": event["sigunguCode"], "before": forecast.json()["asOf"]}
    )
    similar = client.post("/v1/similar", json=event)
    card = client.get("/v1/model-card/latest")
    assert baseline.status_code == similar.status_code == card.status_code == 200
    documents = [
        ("event", [event]),
        ("similar-event", similar.json()),
        ("region-baseline", [baseline.json()]),
        ("forecast", [forecast.json()]),
    ]
    result = subprocess.run(
        [sys.executable, "-c", VERIFY_FACTS],
        input=json.dumps({"card": card.json(), "documents": documents}),
        text=True,
        capture_output=True,
        timeout=60,
        env={**os.environ, "PYTHONPATH": str(DEVELOP_SOURCE), "CROWDCAST_DATA_ROOT": str(tmp_path)},
    )
    assert result.returncode == 0, result.stdout + result.stderr
