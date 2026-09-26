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
        description="데이터랩 자료로 확인한 사실 두 가지예요 — 지자체 발표와 실측의 차이(I1), 법정 기준 근처 행사의 비중(I2). 표본·기간·근거가 확인된 값만 보여 주고, 서식4에 옮길 문장을 복사할 수 있어요."
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
