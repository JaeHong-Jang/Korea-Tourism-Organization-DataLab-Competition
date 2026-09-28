// 선택한 예보의 근거(왼쪽)와 전체 자료·규칙 연결 3D 그래프(오른쪽)를 한 화면 위쪽에 나란히 둔다.
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeading } from "../components/common/page-heading";
import { ForecastEvidenceBrowser } from "../features/knowledge-graph/forecast-evidence-browser";
import { MasterGraph } from "../features/knowledge-graph/master-graph";
import "../styles/snapshot-evidence.css";

const GRAPH_ID = "knowledge-graph-section";

// 예전 주소(?view=master)로 오면 그래프 칸으로 바로 옮겨 준다.
export function KnowledgeGraphPage() {
  const [params] = useSearchParams();
  const jumpToGraph = params.get("view") === "master";
  useEffect(() => {
    if (jumpToGraph)
      document.getElementById(GRAPH_ID)?.scrollIntoView({ block: "start" });
  }, [jumpToGraph]);
  return (
    <div className="page-wrap regular-page knowledge-page">
      <PageHeading
        eyebrow="근거를 따라가요"
        title="예보 근거"
        description="예보 하나의 숫자가 어떤 자료·가정·규칙에서 나왔는지 따라가요."
      />
      <ForecastEvidenceBrowser
        aside={
          <section
            id={GRAPH_ID}
            className="knowledge-page__graph"
            aria-labelledby="knowledge-graph-title"
          >
            <h2 id="knowledge-graph-title">전체 자료·규칙 연결</h2>
            <MasterGraph />
          </section>
        }
      />
    </div>
  );
}
