// 전체 기준 그래프는 발행 예보 탐색과 독립적으로 불러온다.
import { ErrorState } from "../../components/common/error-state";
import { LoadingState } from "../../components/common/loading-state";
import { getKnowledgeGraph } from "./api";
import { KnowledgeGraphView } from "./knowledge-graph";
import { useGraphResource } from "./use-graph-resource";

// 그래프 서비스가 실패해도 선택한 예보 근거 화면에는 영향을 주지 않는다.
const loadGraph = (_key: string, signal: AbortSignal) =>
  getKnowledgeGraph(signal);

// 공통 기준 자료의 범위를 화면에 명시한다.
export function MasterGraph() {
  const graph = useGraphResource("master", loadGraph);
  return (
    <section aria-label="전체 기준 그래프 보기">
      <p className="knowledge-page__graph-note">
        지금 공통 기준이라 개별 예보의 발행 당시 기록과 다를 수 있어요.
      </p>
      {graph.status === "error" ? (
        <ErrorState
          message={graph.error ?? "전체 그래프를 불러오지 못했어요."}
          action={
            <button type="button" onClick={graph.retry}>
              전체 그래프 재시도
            </button>
          }
        />
      ) : graph.value ? (
        <KnowledgeGraphView graph={graph.value} />
      ) : (
        <LoadingState message="전체 기준 그래프를 불러오는 중이에요." />
      )}
    </section>
  );
}
