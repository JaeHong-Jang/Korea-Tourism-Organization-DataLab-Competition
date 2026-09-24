"""기준 TTL과 등록된 모델 실행에서 무결성 검사의 기준 집합을 만든다."""

import logging

import orjson
from knowledge.convert.documents import same_content, schema_problems
from knowledge.convert.integrity import Master
from knowledge.paths import ONTOLOGY
from knowledge.store.repository import CC, ID, MASTER, TBOX, GraphRepository
from rdflib import BNode, Graph, Literal, URIRef
from rdflib.namespace import RDF, XSD

logger = logging.getLogger(__name__)

MASTER_CLASSES = {
    "datasets": (CC.Dataset,),
    "clauses": (CC.LegalClause,),
    "rules": (CC.Rule, CC.LegalRule, CC.InternalRule),
    "assumptions": (CC.Assumption,),
    "agents": (CC.TeamAgent,),
    "modelRuns": (CC.ModelRun,),
}


# 기준 집합은 id 목록 파일을 신뢰하지 않고 저장된 클래스 선언에서 찾는다.
class MasterCatalog:
    # 최초 기동에서만 기준 그래프를 채워 재시작 후 모델 실행과 버전을 보존한다.
    # 이미 있는 저장소에는 기준 TTL에 새로 생긴 정의만 더하고 기존 정의는 바꾸지 않는다(더하면 버전 +1).
    def __init__(self, repository: GraphRepository) -> None:
        self.repository = repository
        with repository.master_lock:
            graph = repository.read_graph(MASTER)
            fresh = Graph()
            for path in sorted((ONTOLOGY / "master").glob("*.ttl")):
                fresh.parse(path, format="turtle")
            if not graph:
                if fresh.value(MASTER, CC.masterVersion) is None:
                    raise ValueError("기준 그래프 masterVersion이 없다")
                repository.replace_graph(MASTER, fresh)
            else:
                # 저장소 쓰기 주체는 knowledge 프로세스 하나라는 전제 — 잠금은 그 안에서 직렬화한다.
                added, conflicts = sync_definitions(graph, fresh)
                if conflicts:
                    logger.warning(
                        "기준 TTL과 저장값이 다른 정의 %d개 — 저장값 유지, 마이그레이션 필요: %s",
                        len(conflicts),
                        ", ".join(conflicts),
                    )
                if added:
                    version = int(graph.value(MASTER, CC.masterVersion))
                    graph.set((MASTER, CC.masterVersion, Literal(version + 1, datatype=XSD.integer)))
                    repository.replace_graph(MASTER, graph)
                    logger.info(
                        "기준 TTL 트리플 %d개 추가 — masterVersion %d → %d", added, version, version + 1
                    )
            if not repository.read_graph(TBOX):
                repository.replace_graph(TBOX, Graph().parse(ONTOLOGY / "crowdcast.ttl", format="turtle"))

    # 한 그래프 스냅샷에서 버전과 실제로 정의된 id 집합을 함께 읽는다.
    def snapshot(self) -> tuple[int, Master]:
        graph = self.repository.read_graph(MASTER)
        sets = {
            kind: {
                str(subject).removeprefix(str(ID))
                for cls in classes
                for subject in graph.subjects(RDF.type, cls)
                if isinstance(subject, URIRef) and str(subject).startswith(str(ID))
            }
            for kind, classes in MASTER_CLASSES.items()
        }
        return int(graph.value(MASTER, CC.masterVersion)), sets

    # 모델 카드의 버전과 학습 기간을 보존하고 새 등록일 때만 기준 버전을 올린다.
    def register_model_run(self, card: dict) -> int:
        problems = schema_problems(card, "model-card")
        if problems:
            raise ValueError("; ".join(problems))
        with self.repository.master_lock:
            graph = self.repository.read_graph(MASTER)
            subject = ID[card["id"]]
            previous = graph.value(subject, CC.sourceDocument)
            version = int(graph.value(MASTER, CC.masterVersion))
            if previous is not None:
                if not same_content(orjson.loads(str(previous)), card):
                    raise ValueError(f"같은 모델 실행 {card['id']}에 다른 내용")
                return version

            # 모델 실행은 세션 밖의 기준 사실이며 원문도 기준 그래프에 남긴다.
            period = BNode()
            graph.add((subject, RDF.type, CC.ModelRun))
            graph.add((subject, CC.modelVersion, Literal(card["modelVersion"])))
            graph.add((subject, CC.trainRange, period))
            graph.add((period, RDF.type, CC.Period))
            graph.add((period, CC.periodFrom, Literal(card["trainRange"]["from"], datatype=XSD.date)))
            graph.add((period, CC.periodTo, Literal(card["trainRange"]["to"], datatype=XSD.date)))
            graph.add((subject, CC.createdAt, Literal(card["createdAt"], datatype=XSD.dateTime)))
            graph.add((subject, CC.sourceDocument, Literal(orjson.dumps(card).decode(), datatype=RDF.JSON)))
            graph.set((MASTER, CC.masterVersion, Literal(version + 1, datatype=XSD.integer)))
            self.repository.replace_graph(MASTER, graph)
            return version + 1


# 저장된 정의에 없는 술어만 더하고, 같은 술어에 다른 값이 있으면 저장값을 두고 충돌로 돌려준다.
def sync_definitions(graph: Graph, fresh: Graph) -> tuple[int, list[str]]:
    added, conflicts = 0, []
    for subject in sorted({s for s in fresh.subjects() if isinstance(s, URIRef) and s != MASTER}):
        stored = {p for p in graph.predicates(subject)}
        changed = False
        for predicate in sorted(set(fresh.predicates(subject))):
            if predicate in stored:
                if not same_values(graph, fresh, subject, predicate):
                    changed = True
                continue
            for obj in fresh.objects(subject, predicate):
                added += copy_node(graph, fresh, (subject, predicate, obj), set())
        if changed:
            conflicts.append(str(subject).removeprefix(str(ID)))
    return added, conflicts


# 빈 노드가 아닌 값끼리 비교한다(빈 노드는 개수만 — 내용 비교는 마이그레이션에서).
def same_values(graph: Graph, fresh: Graph, subject: URIRef, predicate: URIRef) -> bool:
    old, new = set(graph.objects(subject, predicate)), set(fresh.objects(subject, predicate))
    plain_old = {o for o in old if not isinstance(o, BNode)}
    plain_new = {o for o in new if not isinstance(o, BNode)}
    return plain_old == plain_new and len(old - plain_old) == len(new - plain_new)


# 트리플 하나와 그 값이 빈 노드면 그 아래까지 복사한다 — 방문 기록으로 순환을 막는다.
def copy_node(graph: Graph, fresh: Graph, triple: tuple, visited: set[BNode]) -> int:
    graph.add(triple)
    count, obj = 1, triple[2]
    if isinstance(obj, BNode) and obj not in visited:
        visited.add(obj)
        for child in fresh.triples((obj, None, None)):
            count += copy_node(graph, fresh, child, visited)
    return count
