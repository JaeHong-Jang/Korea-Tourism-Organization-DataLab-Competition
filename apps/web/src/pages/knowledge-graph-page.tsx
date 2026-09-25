// 전체 근거 그래프를 계약 API에서 받아 독립 화면으로 보여 준다.
import type { KnowledgeGraph } from "@crowdcast/contracts/types";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ErrorState } from "../components/common/error-state";
import { LoadingState } from "../components/common/loading-state";
import { PageHeading } from "../components/common/page-heading";
import { getKnowledgeGraph } from "../features/knowledge-graph/api";
import { KnowledgeGraphView } from "../features/knowledge-graph/knowledge-graph";
import "@xyflow/react/dist/style.css";

// 로딩·빈 값·계약 오류를 분리하고 재시도할 수 있게 한다.
export function KnowledgeGraphPage() {
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // 재시도 횟수가 바뀌면 같은 계약 주소에서 최신 그래프를 다시 읽는다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: 재시도 횟수는 요청을 다시 시작하는 신호다.
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    getKnowledgeGraph(controller.signal)
      .then(setGraph)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "자료를 불러오지 못했어요.",
          );
      });
    return () => controller.abort();
  }, [attempt]);
  return (
    <div className="page-wrap regular-page knowledge-page">
      <PageHeading
        eyebrow="근거를 따라가요"
        title="근거 그래프"
        description="이 서비스가 쓰는 규칙·법령·데이터·모델이 어떻게 이어지는지 보여 줘요 — 예보서의 모든 문장은 이 그래프의 근거에 닿아요"
      />
      <nav className="knowledge-page__nav" aria-label="검증 화면">
        <Link to="/validation">검증으로 돌아가기</Link>
        <span>근거 그래프</span>
      </nav>
      {error ? (
        <ErrorState
          message={error}
          action={
            <button
              type="button"
              onClick={() => {
                setGraph(null);
                setAttempt((value) => value + 1);
              }}
            >
              다시 시도
            </button>
          }
        />
      ) : graph ? (
        <KnowledgeGraphView graph={graph} />
      ) : (
        <LoadingState message="전체 근거 그래프를 불러오는 중이에요." />
      )}
    </div>
  );
}
