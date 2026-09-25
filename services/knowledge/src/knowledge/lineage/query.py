"""모델 계보를 SPARQL 한 번으로 읽고 모델에서 가까운 깊이순으로 정리한다."""

from collections import defaultdict, deque
from pathlib import Path

from knowledge.query.runner import result_value
from knowledge.store.repository import MASTER, GraphRepository
from pyoxigraph import Literal, NamedNode, Variable

QUERY = Path(__file__).with_name("model_lineage.rq").read_text(encoding="utf-8")


# 여러 학습·평가 경로가 같은 노드에 닿으면 가장 짧은 깊이를 쓴다.
def node_depths(roots: set[str], edges: dict[str, set[str]]) -> dict[str, int]:
    depths = dict.fromkeys(roots, 1)
    pending = deque(sorted(roots))
    while pending:
        node = pending.popleft()
        for child in sorted(edges[node]):
            if child not in depths:
                depths[child] = depths[node] + 1
                pending.append(child)
    return depths


# 바인딩은 RDF 리터럴로 전달하고 기준 그래프만 조회해 세션이나 임의 SPARQL이 섞이지 않게 한다.
def lineage_for_model(model_version: str, repository: GraphRepository) -> dict[str, list[dict]]:
    with repository.master_lock:
        result = repository.store.query(
            QUERY, default_graph=[NamedNode(str(MASTER))], named_graphs=[],
            substitutions={Variable("modelVersion"): Literal(model_version)},
        )
        rows = [
            {variable.value: result_value(row[variable]) for variable in result.variables} for row in result
        ]

    # 관계와 설명을 분리해 파일이 없는 실패 단계도 결과에 남긴다.
    roots, edges = set(), defaultdict(set)
    stages, files, datasets = {}, {}, {}
    for row in rows:
        stage = row["stage"]
        roots.add(row["root"])
        stages[stage] = {
            "id": stage, "name": row["name"], "order": row["order"], "lastRunId": row["runId"],
            "dagsterRunId": row["dagsterRunId"], "status": row["status"],
            "gate": {"result": row["gateResult"], "passed": row["gatePassed"], "message": row["gateMessage"]},
        }
        if row["parent"]:
            edges[stage].add(row["parent"])
        if row["file"]:
            file = row["file"]
            edges[stage].add(file)
            entry = files.setdefault(file, {
                "id": file, "path": row["path"], "sha256": row["sha256"], "note": row["note"], "stages": [],
            })
            relation = {"id": stage, "direction": row["direction"]}
            if relation not in entry["stages"]:
                entry["stages"].append(relation)
            if row["dataset"]:
                dataset = row["dataset"]
                edges[file].add(dataset)
                datasets[dataset] = {"id": dataset, "title": row["title"]}

    # 출력마다 안정적인 깊이·식별자 순서를 유지한다.
    depths = node_depths(roots, edges)
    for file in files.values():
        file["stages"].sort(key=lambda item: (item["id"], item["direction"]))
    return {
        key: sorted(
            [{**value, "depth": depths[node]} for node, value in nodes.items()],
            key=lambda item: (item["depth"], item["id"]),
        )
        for key, nodes in (("stages", stages), ("files", files), ("datasets", datasets))
    }
