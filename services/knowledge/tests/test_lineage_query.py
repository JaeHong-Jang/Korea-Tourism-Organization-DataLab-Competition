"""모델에서 데이터셋까지의 단일 SPARQL 질의와 모델 산출물 매칭을 검증한다."""

from hashlib import sha256

import orjson
import pytest
from knowledge import paths
from knowledge.lineage.datasets import dataset_for_path
from knowledge.lineage.load import load_lineage
from knowledge.lineage.mapping import stage_id
from knowledge.lineage.query import lineage_for_model
from knowledge.store.repository import CC, ID, MASTER
from lineage_cases import prepared_store
from rdflib import Literal
from rdflib.namespace import PROV


# 실제 사용 모델의 train부터 fetch 자료까지 이어지고 최신 다른 후보의 backtest는 붙지 않는다.
def test_real_model_reaches_datasets() -> None:
    store, path, card = prepared_store()
    load_lineage(path, store.repository)
    result = lineage_for_model(card["modelVersion"], store.repository)
    assert [stage["name"] for stage in result["stages"]] == [
        "crowdcast/train", "crowdcast/features", "crowdcast/labels", "crowdcast/fetch",
    ]
    assert [stage["depth"] for stage in result["stages"]] == [1, 2, 3, 4]
    assert result["stages"][-1]["gate"]["passed"] is False
    assert {dataset["id"] for dataset in result["datasets"]} == {
        "ds-kto-visitors-15101972", "ds-mcst-festival-plans", "ds-admdongkor-boundaries",
    }
    assert any(file["path"] == "data/processed/labels.parquet" for file in result["files"])
    for collection in result.values():
        assert [node["depth"] for node in collection] == sorted(node["depth"] for node in collection)
    assert lineage_for_model('unknown" } UNION { ?s ?p ?o', store.repository) == {
        "stages": [], "files": [], "datasets": [],
    }

    # 일괄 예보 출력은 batch의 used ModelRun을 거쳐 같은 기준 계보를 사용할 수 있다.
    graph = store.repository.read_graph(MASTER)
    batch = next(graph.subjects(CC.name, Literal("crowdcast/batch")))
    assert (batch, PROV.used, ID[card["id"]]) in graph


# 모델 카드의 버전·내용·기록 해시 중 하나라도 맞지 않으면 직접 연결을 만들지 않는다.
@pytest.mark.parametrize("problem", ["hash", "content", "version", "missing", "symlink"])
def test_model_mismatch_does_not_invent_lineage(problem: str) -> None:
    store, path, card = prepared_store()
    document = orjson.loads(path.read_bytes())
    model_path = paths.DATA_ROOT / "models" / card["modelVersion"] / "model_card.json"
    asset = document["assets"][3]
    artifact = next(file for file in asset["outputFiles"] if file["path"].endswith("/model_card.json"))
    if problem == "hash":
        artifact["sha256"] = "0" * 64
    elif problem == "version":
        artifact["path"] = "models/v1-other/model_card.json"
    elif problem == "content":
        model_path.write_bytes(orjson.dumps({**card, "notes": "변경된 학습 설명"}))
        artifact["sha256"] = sha256(model_path.read_bytes()).hexdigest()
    elif problem == "missing":
        model_path.unlink()
    else:
        model_path.unlink()
        model_path.symlink_to(paths.CONTRACTS / "fixtures/model-card/valid-v0-1-0.json")
    path.write_bytes(orjson.dumps(document))
    assert load_lineage(path, store.repository) == 3
    assert lineage_for_model(card["modelVersion"], store.repository)["stages"] == []


# 평가 실행 ID와 모델·해시가 모두 맞으면 실패한 backtest도 직접 계보로 남긴다.
def test_matching_failed_backtest_and_batch_output() -> None:
    store, path, card = prepared_store()
    document = orjson.loads(path.read_bytes())
    report_path = paths.DATA_ROOT / "reports/backtest" / card["backtestRunId"] / "backtest.json"
    report_path.parent.mkdir(parents=True)
    report_path.write_bytes(orjson.dumps({
        "runId": card["backtestRunId"], "modelVersion": card["modelVersion"], "modelRunId": card["id"],
    }))
    document["assets"][4]["outputFiles"] = [{
        "path": report_path.relative_to(paths.DATA_ROOT).as_posix(),
        "sha256": sha256(report_path.read_bytes()).hexdigest(), "rows": None,
    }]
    document["assets"][5]["outputFiles"] = [{
        "path": "data/processed/upcoming_forecasts.json", "sha256": "a" * 64, "rows": None,
    }]
    path.write_bytes(orjson.dumps(document))
    load_lineage(path, store.repository)
    result = lineage_for_model(card["modelVersion"], store.repository)
    backtest = next(stage for stage in result["stages"] if stage["name"] == "crowdcast/backtest")
    assert backtest["gate"]["passed"] is False and backtest["depth"] == 1
    digest = sha256(path.read_bytes()).hexdigest()
    graph = store.repository.read_graph(MASTER)
    assert (ID[card["id"]], PROV.wasInformedBy, stage_id(digest, "crowdcast/backtest")) in graph
    assert graph.query('''
        PREFIX cc: <http://crowdcast.local/ont#>
        PREFIX prov: <http://www.w3.org/ns/prov#>
        ASK {
          ?file cc:filePath "data/processed/upcoming_forecasts.json" ; prov:wasGeneratedBy ?batch .
          ?batch prov:used ?model . ?model a cc:ModelRun ; prov:wasInformedBy ?root .
          ?root prov:wasInformedBy*/prov:used/prov:wasDerivedFrom ?dataset . ?dataset a cc:Dataset .
        }
    ''').askAnswer


# 확인된 원본 보관 폴더만 연결하고 비슷한 이름이나 혼합 정제표는 추측하지 않는다.
def test_dataset_mapping_is_conservative() -> None:
    festival = dataset_for_path("data/raw/datalab/festival/연천구석기축제.zip")
    assert festival == ID["ds-datalab-festival-status"]
    assert dataset_for_path("data/raw/datalab/diy/영종도불꽃축제.csv") == ID["ds-datalab-diy"]
    assert dataset_for_path("data/raw/datalab/festival-other/연천구석기축제.zip") is None
    assert dataset_for_path("data/processed/labels.parquet") is None
