// 검증된 인사이트와 실제 데이터랩 사용 기록만 표시한다.
import { FeaturePanel } from "../components/common/feature-panel";
import { PageHeading } from "../components/common/page-heading";
import { DatalabSpecTable } from "../features/insights/datalab-spec-table";
import { InsightResults } from "../features/insights/insight-results";
import { getInsight, getSpec } from "../lib/validation/api";
import { useContract } from "../lib/validation/use-contract";

const getFirst = (signal: AbortSignal) => getInsight("I1", signal);
const getSecond = (signal: AbortSignal) => getInsight("I2", signal);

// 인사이트가 없으면 복사 기능도 함께 숨긴다.
export function InsightsPage() {
  const first = useContract(getFirst);
  const second = useContract(getSecond);
  const spec = useContract(getSpec);
  return (
    <div className="page-wrap regular-page insights-page">
      <PageHeading
        eyebrow="S7 · 데이터에서 찾은 단서"
        title="인사이트"
        description="표본과 기간, 근거를 확인한 결과만 소개해요."
      />
      <div className="insights-layout">
        <FeaturePanel
          id="M7-F1"
          title="인사이트 카드"
          description="수집이 끝난 지표부터 중요도 순으로 읽어 보세요."
          className="insights-main"
        >
          <InsightResults first={first} second={second} />
        </FeaturePanel>
        <FeaturePanel
          id="M7-F2"
          title="데이터랩 활용 명세"
          description="실제로 사용한 자료의 메뉴·지표·기간·용도를 확인해요."
          className="insights-spec"
        >
          <DatalabSpecTable state={spec} />
        </FeaturePanel>
      </div>
    </div>
  );
}
