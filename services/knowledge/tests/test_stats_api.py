"""통계 API의 손계산 기대값·세션 경계·실제 그래프 크기·응답 계약을 검증한다."""

from datetime import datetime
from pathlib import Path
from typing import Any

import pytest
from contract_cases import RDFLIB_NQUADS_WARNING, SESSION_ID, memory_store, read_json
from fastapi.testclient import TestClient
from knowledge.api import stats
from knowledge.api.app import create_app
from knowledge.api.contract_response import response_validator
from knowledge.convert.documents import schema_problems
from knowledge.paths import CONTRACTS
from knowledge.store.repository import CC, ID, MASTER, TBOX
from query_cases import load_sequence, sequence
from rdflib import Graph, Literal, Namespace
from rdflib.namespace import PROV, RDF
from stats_cases import mixed_published_session

pytestmark = pytest.mark.filterwarnings(RDFLIB_NQUADS_WARNING)
DATASETS = Path(__file__).parent / "fixtures/stats/datasets.json"
CITO = Namespace("http://purl.org/spar/cito/")


# 3문장·고유 근거 3개·데이터랩 도달 2문장을 손으로 센 값과 모든 필드로 비교한다.
def test_usage_counts_only_published_claims() -> None:
    store = memory_store()
    mixed_published_session(store)
    with TestClient(create_app(store)) as client:
        response = client.get("/v1/stats/datalab-usage")
    assert response.status_code == 200, response.text
    result = response.json()
    assert schema_problems(result, "datalab-usage") == []
    assert result.keys() == read_json(CONTRACTS / "fixtures/datalab-usage/valid-example.json").keys()
    generated = datetime.fromisoformat(result.pop("generatedAt"))
    assert generated.tzinfo is not None
    datasets = read_json(DATASETS)
    for dataset in datasets:
        dataset["count"] = {
            "ds-kto-visitors-15101972": 2,
            "ds-kto-tourapi-15101578": 1,
        }.get(dataset["datasetId"], 0)
    assert result == {
        "publishedClaims": 3,
        "claimsWithEvidence": 3,
        "claimsReachingDatalab": 2,
        "evidenceByDataset": datasets,
        "shaclPassRate": None,
    }
    claims = store.scope(SESSION_ID)["claims"].values()
    assert sorted(claim["status"] for claim in claims) == ["candidate", "published", "published", "published"]


# 비어 있거나 후보만 있는 저장소는 모든 데이터셋을 0건으로 보존한다.
@pytest.mark.parametrize("candidate", [False, True])
def test_zero_published_claims(candidate: bool) -> None:
    store = memory_store()
    if candidate:
        load_sequence(store, publish=False)
    with TestClient(create_app(store)) as client:
        response = client.get("/v1/stats/datalab-usage")
    assert response.status_code == 200
    result = response.json()
    assert schema_problems(result, "datalab-usage") == []
    result.pop("generatedAt")
    assert result == {
        "publishedClaims": 0,
        "claimsWithEvidence": 0,
        "claimsReachingDatalab": 0,
        "evidenceByDataset": read_json(DATASETS),
        "shaclPassRate": None,
    }


# 전역 통계는 여러 발행 세션을 포함하되 계보 경로를 다른 그래프에서 보충하지 않는다.
def test_global_stats_keep_lineage_inside_session() -> None:
    store = memory_store()
    load_sequence(store)
    load_sequence(store, case=sequence("s-yeongjong-other", "-other"))
    with TestClient(create_app(store)) as client:
        result = client.get("/v1/stats/datalab-usage").json()
        assert (result["publishedClaims"], result["claimsWithEvidence"], result["claimsReachingDatalab"]) == (
            4,
            4,
            2,
        )
        assert sum(row["count"] for row in result["evidenceByDataset"]) == 2

        # 같은 예보 id의 계보가 다른 세션에만 있으면 인용 문장의 데이터랩 도달로 세지 않는다.
        graph = store.repository.read_graph(ID[SESSION_ID])
        lineage = list(graph.triples((ID["f-yeongjong-2025"], PROV.wasGeneratedBy, None)))
        graph.remove((ID["f-yeongjong-2025"], PROV.wasGeneratedBy, None))
        store.repository.replace_graph(ID[SESSION_ID], graph)
        other = store.repository.read_graph(ID["s-yeongjong-other"])
        for triple in lineage:
            other.add(triple)
        store.repository.replace_graph(ID["s-yeongjong-other"], other)
        result = client.get("/v1/stats/datalab-usage").json()
    assert result["publishedClaims"] == result["claimsWithEvidence"] == 4
    assert result["claimsReachingDatalab"] == 1
    assert sum(row["count"] for row in result["evidenceByDataset"]) == 1


# 같은 문장은 세션마다 세고 같은 근거는 전역에서 한 번만 세며 재적재는 수를 늘리지 않는다.
@pytest.mark.parametrize("session_count", [1, 2])
@pytest.mark.parametrize("reload_claim", [False, True])
def test_shared_claim_and_evidence_ids(session_count: int, reload_claim: bool) -> None:
    store = memory_store()
    sessions = [SESSION_ID, "s-yeongjong-repeat"][:session_count]
    for session_id in sessions:
        case = sequence(session_id)
        case["steps"] = [
            step for step in case["steps"] if step.get("doc", {}).get("id") != "c-yeongjong-3"
        ]
        for step in case["steps"]:
            for check in step.get("doc", {}).get("checks", []):
                check["revision"] = 5
        load_sequence(store, case=case)

    # 이미 발행한 동일 문서를 중복 항목과 재시도로 보내도 세션의 한 문장으로 남는다.
    with TestClient(create_app(store)) as client:
        if reload_claim:
            for session_id in sessions:
                scope = store.scope(session_id)
                claim = scope["claims"]["c-yeongjong-4"]
                response = client.post(
                    f"/v1/sessions/{session_id}/facts",
                    json={"schema": "claim", "items": [claim, claim]},
                )
                assert response.status_code == 200, response.text
                assert store.scope(session_id)["revision"] == scope["revision"]
        response = client.get("/v1/stats/datalab-usage")

    # 세션 둘의 문장 id는 같아도 발행·인용·데이터랩 도달은 각각 두 문장이다.
    assert response.status_code == 200, response.text
    result = response.json()
    assert schema_problems(result, "datalab-usage") == []
    assert result["publishedClaims"] == session_count
    assert result["claimsWithEvidence"] == session_count
    assert result["claimsReachingDatalab"] == session_count
    datasets = read_json(DATASETS)
    for dataset in datasets:
        dataset["count"] = int(dataset["datasetId"] == "ds-kto-visitors-15101972")
    assert result["evidenceByDataset"] == datasets


# 기준 그래프에 없는 출처와 근거 없는 과거 발행 문장도 모수·연결 수를 왜곡하지 않는다.
def test_missing_evidence_and_untrusted_dataset() -> None:
    store = memory_store()
    graph = Graph()
    graph.add((ID["c-yeongjong-empty"], RDF.type, CC.Claim))
    graph.add((ID["c-yeongjong-empty"], CC.status, Literal("published")))
    graph.add((ID["c-yeongjong-local"], RDF.type, CC.Claim))
    graph.add((ID["c-yeongjong-local"], CC.status, Literal("published")))
    graph.add((ID["c-yeongjong-local"], CITO.citesAsEvidence, ID["ev-yeongjong-local"]))
    graph.add((ID["ev-yeongjong-local"], CC.derivedFromDataset, ID["ds-yeongjong-local"]))
    graph.add((ID["ds-yeongjong-local"], CC.datalabMenu, Literal("세션 내부 출처")))
    store.repository.replace_graph(ID[SESSION_ID], graph)
    with TestClient(create_app(store)) as client:
        result = client.get("/v1/stats/datalab-usage").json()
    assert (result["publishedClaims"], result["claimsWithEvidence"], result["claimsReachingDatalab"]) == (
        2,
        1,
        0,
    )
    assert result["evidenceByDataset"] == read_json(DATASETS)


# 온톨로지 그래프를 제외하고 실제 저장된 두 세션의 전체 트리플을 센다.
@pytest.mark.parametrize("session_count", [0, 2])
def test_graph_stats_match_store(session_count: int) -> None:
    store = memory_store()
    sessions = ["s-yeongjong-first", "s-yeongjong-second"][:session_count]
    for index, session_id in enumerate(sessions):
        load_sequence(store, case=sequence(session_id, f"-{index}"), publish=False)
    with TestClient(create_app(store)) as client:
        response = client.get("/v1/stats/graph")
    assert response.status_code == 200
    result = response.json()
    assert result == {
        "masterVersion": store.master.snapshot()[0],
        "masterTriples": len(store.repository.read_graph(MASTER)),
        "sessions": session_count,
        "sessionTriples": sum(len(store.repository.read_graph(ID[sid])) for sid in sessions),
    }
    assert len(store.repository.read_graph(TBOX)) > 0
    validator = response_validator("ops-status").evolve(
        schema={"$ref": "https://crowdcast.local/schemas/ops-status.schema.json#/$defs/graphStats"}
    )
    validator.validate(result)
    fixture = read_json(next((CONTRACTS / "fixtures/ops-status").glob("valid-*.json")))
    assert result.keys() == fixture["graph"].keys()


# 통계 구현에 잘못된 반환값을 주입하면 계약 오류로 닫고 내부 원문을 숨긴다.
@pytest.mark.parametrize(
    "function,path,content",
    [
        ("datalab_usage", "/v1/stats/datalab-usage", {"internal": "비공개"}),
        ("graph_stats", "/v1/stats/graph", {"masterVersion": 0, "internal": "비공개"}),
    ],
)
def test_stats_response_contract(
    function: str, path: str, content: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(stats, function, lambda *args: content)
    with TestClient(create_app(memory_store())) as client:
        response = client.get(path)
    assert response.status_code == 500
    assert schema_problems(response.json(), "gate-report") == []
    assert "비공개" not in response.text
