"""계보 파일을 해시로 중복 판정하고 검증된 스냅샷을 기준 그래프에 원자 적재한다."""

import logging
from hashlib import sha256
from pathlib import Path

from knowledge import paths
from knowledge.lineage.mapping import lineage_graph
from knowledge.lineage.models import link_models
from knowledge.lineage.schema import LineageDocument
from knowledge.store.repository import CC, ID, MASTER, GraphRepository
from pyshacl import validate
from rdflib import Graph, Literal
from rdflib.namespace import XSD

logger = logging.getLogger(__name__)


# 세션 API의 S01~S12 계약을 늘리지 않고 적재 경계에서 전용 SHACL을 강제한다.
def validate_lineage(graph: Graph) -> None:
    shapes = Graph().parse(paths.ONTOLOGY / "shapes/pipeline-stage-gate.ttl", format="turtle")
    conforms, _, _ = validate(
        data_graph=graph, shacl_graph=shapes, inference="none", do_owl_imports=False, inplace=False,
    )
    if not conforms:
        raise ValueError("파이프라인 단계의 게이트 SHACL 검증 실패")


# 파일 내용·그래프·버전을 같은 잠금과 트랜잭션 아래 갱신해 실패 시 이전 상태를 보존한다.
def load_lineage(path: Path, repository: GraphRepository) -> int:
    raw = path.read_bytes()
    digest = sha256(raw).hexdigest()
    with repository.master_lock:
        master = repository.read_graph(MASTER)
        version = int(master.value(MASTER, CC.masterVersion))
        if master.value(MASTER, CC.lineageSha256) == Literal(digest):
            return version
        document = LineageDocument.model_validate_json(raw)
        graph = lineage_graph(document, digest)
        link_models(graph, master, document, digest)
        validate_lineage(graph)
        master += graph
        master.set((MASTER, CC.lineageSha256, Literal(digest)))
        master.set((MASTER, CC.currentLineage, ID[f"lineage-{digest}"]))
        master.set((MASTER, CC.masterVersion, Literal(version + 1, datatype=XSD.integer)))
        repository.replace_graph(MASTER, master)
        return version + 1


# 파일이 없으면 건너뛰고 손상된 계보는 기존 모델 카드 기동 정책처럼 경고만 남긴다.
def load_startup_lineage(repository: GraphRepository) -> None:
    path = paths.DATA_ROOT / "reports/runs/lineage.json"
    if not path.exists():
        return
    try:
        version = load_lineage(path, repository)
    except (OSError, ValueError) as error:
        logger.warning("파이프라인 계보 기동 적재 실패: exception=%s", type(error).__name__)
        return
    logger.info("파이프라인 계보 등록: masterVersion=%s", version)
