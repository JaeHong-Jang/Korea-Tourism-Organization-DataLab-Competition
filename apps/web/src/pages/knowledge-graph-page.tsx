// 발행 예보의 근거를 읽고 하단에서 전체 자료·규칙의 상세 탐색으로 이동한다.
import { Link, useSearchParams } from "react-router-dom";
import { PageHeading } from "../components/common/page-heading";
import { ForecastEvidenceBrowser } from "../features/knowledge-graph/forecast-evidence-browser";
import { MasterGraph } from "../features/knowledge-graph/master-graph";
import { ResearchModelEvidence } from "../features/knowledge-graph/research-model-evidence";
import "../styles/snapshot-evidence.css";

// 보기 전환에도 행사·발행 식별자를 보존해 같은 예보로 돌아온다.
export function KnowledgeGraphPage() {
  const [params] = useSearchParams();
  const master = params.get("view") === "master";
  const snapshotParams = new URLSearchParams(params);
  snapshotParams.delete("view");
  const masterParams = new URLSearchParams(params);
  masterParams.set("view", "master");
  return (
    <div className="page-wrap regular-page knowledge-page">
      <PageHeading
        eyebrow="근거를 따라가요"
        title={master ? "전체 자료·규칙 연결" : "예보 근거"}
        description={
          master
            ? "예보 시스템의 공통 자료·모델·규칙이 어떻게 연결되는지 살펴봐요."
            : "연구 모델의 검증 범위와 발행 예보의 자료·가정·규칙을 나누어 확인해요."
        }
      />
      {master && (
        <nav className="knowledge-page__nav" aria-label="예보 근거로 돌아가기">
          <Link to={`/graph?${snapshotParams}`}>
            ← 선택한 예보 근거로 돌아가기
          </Link>
        </nav>
      )}
      {master ? (
        <MasterGraph />
      ) : (
        <>
          <ResearchModelEvidence />
          <ForecastEvidenceBrowser />
        </>
      )}
      {!master && (
        <aside className="evidence-explore" aria-label="전체 근거 상세 탐색">
          <div>
            <h2>전체 자료와 규칙도 궁금하다면</h2>
            <p>공통 기준의 연결을 3D 그래프와 표로 살펴볼 수 있어요.</p>
          </div>
          <Link to={`/graph?${masterParams}`}>
            전체 자료·규칙 연결 살펴보기 →
          </Link>
        </aside>
      )}
    </div>
  );
}
