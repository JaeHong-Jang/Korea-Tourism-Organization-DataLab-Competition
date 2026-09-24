"""다섯 SPARQL의 고정 결과와 발행 필터·세션 격리·데이터랩 중복 제거를 검증한다."""

from pathlib import Path

import pytest
from contract_cases import RDFLIB_NQUADS_WARNING, SESSION_ID, memory_store, read_json
from fastapi.testclient import TestClient
from knowledge.api.app import create_app
from knowledge.query import runner as query
from knowledge.query.published_graph import published_graph
from knowledge.store.repository import CC, ID, MASTER
from query_cases import add_claim, load_sequence, publish_session, sequence
from rdflib import Literal
from rdflib.namespace import PROV

pytestmark = pytest.mark.filterwarnings(RDFLIB_NQUADS_WARNING)
SNAPSHOTS = Path(__file__).parent / "fixtures/queries"


# 출력 열·정렬·기준 데이터 연결을 코드와 별개인 고정 JSON과 비교한다.
@pytest.mark.parametrize("name", query.QUERY_BINDINGS)
def test_query_snapshot(name: str) -> None:
    store = memory_store()
    load_sequence(store)
    scope = query.QueryScope(store.repository, SESSION_ID)
    assert query.run(name, {}, scope) == read_json(SNAPSHOTS / f"{name}.json")


# 후보 문장은 근거·계보·규칙·작업 질의와 통계의 발행 모수에 들어가지 않는다.
def test_candidate_and_empty_session_are_private() -> None:
    store = memory_store()
    load_sequence(store, publish=False)
    for session_id in [SESSION_ID, "s-yeongjong-empty"]:
        scope = query.QueryScope(store.repository, session_id)
        for name in query.QUERY_BINDINGS.keys() - {"datalab_usage"}:
            assert query.run(name, {}, scope) == []
        assert query.run("datalab_usage", {}, scope) == [
            {"menu": None, "count": 0, "publishedClaims": 0, "claimsReachingDatalab": 0, "ratio": 0.0}
        ]


# 다른 세션이 발행되어도 현재 세션 결과와 바인딩 범위는 그대로다.
def test_queries_cannot_see_other_sessions() -> None:
    store = memory_store()
    load_sequence(store)
    scope = query.QueryScope(store.repository, SESSION_ID)
    before = {name: query.run(name, {}, scope) for name in query.QUERY_BINDINGS}
    load_sequence(store, case=sequence("s-yeongjong-retry", "-retry"))
    for name in query.QUERY_BINDINGS:
        assert query.run(name, {}, scope) == before[name]
    assert query.run("claim_evidence", {"claim": "c-yeongjong-3-retry"}, scope) == []
    assert query.run("forecast_lineage", {"forecast": "f-yeongjong-2025-retry"}, scope) == []
    assert query.run("session_summary", {"session": "s-yeongjong-retry"}, scope) == []
    assert len(query.run("claim_evidence", {"claim": "c-yeongjong-3"}, scope)) == 1


# 메뉴 표기는 기준 그래프를 따르고 같은 근거·관측값·문장은 중복 계산하지 않는다.
def test_datalab_direct_and_indirect_paths() -> None:
    store = memory_store()
    load_sequence(store)
    ids = ["ev-case-e-yeongjong-2024", "ev-baseline-28110", "ev-model-f-yeongjong-2025"]
    add_claim(store, ids)
    with TestClient(create_app(store)) as client:
        publish_session(client, store)
    scope = query.QueryScope(store.repository, SESSION_ID)
    rows = query.run("datalab_usage", {}, scope)
    assert [(row["menu"], row["count"]) for row in rows] == [
        ("[테마] 문화관광축제 현황", 1),
        ("빅데이터 › 지역별 방문자수(이동통신)", 2),
    ]
    assert all(row["publishedClaims"] == 3 and row["claimsReachingDatalab"] == 2 for row in rows)
    assert all(row["ratio"] == pytest.approx(2 / 3) for row in rows)
    cards = query.run("claim_evidence", {"claim": "c-yeongjong-sources"}, scope)
    data = next(row for row in cards if row["evidence"] == "ev-baseline-28110")
    assert (
        data["dataset"],
        data["publisher"],
        data["periodFrom"],
        data["periodTo"],
        data["availableAt"],
    ) == ("ds-kto-visitors-15101972", "한국관광공사", "2025-09-06", "2025-09-27", "2025-10-01")

    # 같은 출처에 관측값을 더 연결해도 고유 근거 수와 도달 문장 수는 같아야 한다.
    graph = store.repository.read_graph(ID[SESSION_ID])
    for predicate, value in list(graph.predicate_objects(ID["obs-28110-sat-nonlocal"])):
        graph.add((ID["obs-28110-sat-nonlocal-retry"], predicate, value))
    graph.add((ID["pr-f-yeongjong-2025"], PROV.used, ID["obs-28110-sat-nonlocal-retry"]))
    store.repository.replace_graph(ID[SESSION_ID], graph)
    assert query.run("datalab_usage", {}, scope) == rows


# 데이터랩에 닿지 않는 발행 문장도 모수에서 빠지지 않는다.
def test_datalab_zero_connected_claims() -> None:
    store = memory_store()
    case = sequence()
    case["steps"] = [step for step in case["steps"] if step.get("doc", {}).get("id") != "c-yeongjong-4"]
    for step in case["steps"]:
        for check in step.get("doc", {}).get("checks", []):
            check["revision"] = 5
    load_sequence(store, case=case)
    rows = query.run("datalab_usage", {}, query.QueryScope(store.repository, SESSION_ID))
    assert rows == [
        {"menu": None, "count": 0, "publishedClaims": 1, "claimsReachingDatalab": 0, "ratio": 0.0}
    ]


# 임의 파일과 미지원 변수는 실행하지 않고 값 안의 구문은 RDF 항으로만 해석한다.
def test_query_input_is_bound_not_interpolated() -> None:
    store = memory_store()
    scope = query.QueryScope(store.repository, SESSION_ID)
    with pytest.raises(ValueError):
        query.run("../crowdcast", {}, scope)
    with pytest.raises(ValueError):
        query.run("claim_evidence", {"session": "s-yeongjong-retry"}, scope)
    with pytest.raises(ValueError):
        query.run("claim_evidence", {"claim": "c-x> } UNION { ?s ?p ?o } #"}, scope)
    with pytest.raises(ValueError):
        query.QueryScope(store.repository, "master")


# 가정의 수치는 세션 값을 유지하고 모델 버전은 기준 그래프에서 읽는다.
def test_lineage_keeps_session_assumptions() -> None:
    store = memory_store()
    load_sequence(store)
    master = store.repository.read_graph(MASTER)
    master.add((ID["as-peak-day-factor"], CC.value, Literal(99)))
    store.repository.replace_graph(MASTER, master)
    rows = query.run(
        "forecast_lineage", {"forecast": "f-yeongjong-2025"}, query.QueryScope(store.repository, SESSION_ID)
    )
    assert next(row for row in rows if row["node"] == "as-peak-day-factor")["value"] == 1.0
    graph = published_graph(query.QueryScope(store.repository, SESSION_ID))
    assert [float(value) for value in graph.objects(ID["as-peak-day-factor"], CC.value)] == [1.0]
