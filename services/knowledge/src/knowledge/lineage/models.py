"""등록된 모델 카드와 기록된 산출물의 버전·해시가 맞는 실행만 연결한다."""

import logging
from hashlib import sha256
from pathlib import PurePosixPath

import orjson
from knowledge import paths
from knowledge.convert.documents import same_content
from knowledge.lineage.mapping import stage_id
from knowledge.lineage.schema import LineageDocument, LineageFile
from knowledge.store.repository import CC
from rdflib import Graph
from rdflib.namespace import PROV, RDF

logger = logging.getLogger(__name__)


# 실제 산출물은 루트 안에서만 읽으며 해시가 있으면 기록과 정확히 대조한다.
def artifact_document(file: LineageFile) -> dict | None:
    path = (paths.DATA_ROOT / file.path).resolve()
    if not path.is_relative_to(paths.DATA_ROOT.resolve()):
        return None
    try:
        raw = path.read_bytes()
        if file.sha256 is not None and sha256(raw).hexdigest() != file.sha256:
            return None
        value = orjson.loads(raw)
        return value if isinstance(value, dict) else None
    except (OSError, ValueError):
        return None


# 디렉터리 이름과 카드 원문까지 대조해 다른 후보나 같은 버전의 변조물을 연결하지 않는다.
def matches_card(file: LineageFile, card: dict) -> bool:
    if file.path != str(PurePosixPath("models") / card["modelVersion"] / "model_card.json"):
        return False
    artifact = artifact_document(file)
    return artifact is not None and same_content(artifact, card)


# backtest는 최신 단계라는 이유로 붙이지 않고 카드에 기록된 평가 실행과 버전을 대조한다.
def matches_backtest(file: LineageFile, card: dict) -> bool:
    run_id = card.get("backtestRunId")
    if not run_id or file.path != str(PurePosixPath("reports/backtest") / run_id / "backtest.json"):
        return False
    artifact = artifact_document(file)
    return (
        artifact is not None and artifact.get("runId") == run_id
        and artifact.get("modelVersion") == card["modelVersion"]
        and artifact.get("modelRunId") == card["id"]
    )


# ModelRun도 Activity이므로 생성 관계 대신 단계 사이의 wasInformedBy로 연결한다.
def link_models(graph: Graph, master: Graph, document: LineageDocument, digest: str) -> None:
    for model in master.subjects(RDF.type, CC.ModelRun):
        source = master.value(model, CC.sourceDocument)
        if source is None:
            continue
        card = orjson.loads(str(source))
        for asset in document.assets:
            if asset.lastRunId is None:
                continue
            stage = stage_id(digest, asset.key)
            name = asset.key.rsplit("/", 1)[-1]
            if name == "train" and any(matches_card(file, card) for file in asset.outputFiles):
                graph.add((model, PROV.wasInformedBy, stage))
            elif name == "backtest" and any(matches_backtest(file, card) for file in asset.outputFiles):
                graph.add((model, PROV.wasInformedBy, stage))
            elif name == "batch" and any(matches_card(file, card) for file in asset.inputFiles):
                graph.add((stage, PROV.used, model))
        if not any(graph.objects(model, PROV.wasInformedBy)):
            logger.warning("모델에 맞는 계보 산출물 없음: modelVersion=%s", card["modelVersion"])
