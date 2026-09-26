"""발행 문장과 고유 인용 근거를 기준 데이터셋별 통계로 묶는다."""

from datetime import UTC, datetime

from knowledge.query.runner import query_text, result_value
from knowledge.store.repository import GraphRepository
from knowledge.store.validation_log import shacl_pass_rate


# 한 SPARQL 스냅샷 안에서 세션별 경로를 유지하고 기준 데이터셋의 0건도 읽는다.
def datalab_usage(repository: GraphRepository) -> dict:
    with repository.master_lock:
        results = repository.store.query(query_text("datalab_usage"), default_graph=[])
        rows = [
            {variable.value: result_value(row[variable]) for variable in results.variables} for row in results
        ]
    counters = ("publishedClaims", "claimsWithEvidence", "claimsReachingDatalab")
    return {
        "generatedAt": datetime.now(UTC).isoformat(),
        **{key: rows[0][key] for key in counters},
        "evidenceByDataset": [
            {key: row[key] for key in ("datasetId", "title", "datalabMenu", "count")} for row in rows
        ],
        "shaclPassRate": shacl_pass_rate(),
    }
