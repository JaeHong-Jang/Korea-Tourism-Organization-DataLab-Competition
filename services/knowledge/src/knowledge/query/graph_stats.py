"""기준 그래프와 세션 named graph의 실제 트리플 수를 집계한다."""

from knowledge.query.runner import result_value
from knowledge.store.repository import GraphRepository

GRAPH_STATS = """
PREFIX cc: <http://crowdcast.local/ont#>
SELECT ?masterVersion ?masterTriples ?sessions ?sessionTriples
WHERE {
  GRAPH <http://crowdcast.local/id/master> {
    <http://crowdcast.local/id/master> cc:masterVersion ?masterVersion
  }
  {
    SELECT (COUNT(*) AS ?masterTriples)
    WHERE { GRAPH <http://crowdcast.local/id/master> { ?s ?p ?o } }
  }
  {
    SELECT (COUNT(DISTINCT ?session) AS ?sessions) (COUNT(?s) AS ?sessionTriples)
    WHERE {
      GRAPH ?session { ?s ?p ?o }
      FILTER(STRSTARTS(STR(?session), "http://crowdcast.local/id/s-"))
    }
  }
}
"""


# 버전과 트리플 수를 같은 질의로 읽어 기준 갱신 중에도 서로 맞게 한다.
def graph_stats(repository: GraphRepository) -> dict:
    with repository.master_lock:
        results = repository.store.query(GRAPH_STATS, default_graph=[])
        row = next(iter(results))
        return {variable.value: result_value(row[variable]) for variable in results.variables}
