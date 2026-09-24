// 인사이트와 실제 데이터랩 사용 명세의 자리를 구분한다.
import { FeaturePanel } from "../components/common/feature-panel";
import { PageHeading } from "../components/common/page-heading";

// 핵심 카드가 넓은 공간을 차지하고 명세표와 복사 동작은 옆에 둔다.
export function InsightsPage() {
  return (
    <div className="page-wrap regular-page">
      <PageHeading
        eyebrow="S7 · 데이터에서 찾은 단서"
        title="인사이트"
        description="행사 유형과 지역의 패턴을 근거와 함께 살펴보세요."
      />
      <div className="insights-layout">
        <FeaturePanel
          id="M7-F1"
          title="인사이트 카드"
          description="중요도에 따라 주요 발견을 크게 보여 드려요."
          className="insights-main"
        />
        <FeaturePanel
          id="M7-F2"
          title="데이터랩 활용 명세"
          description="실제로 사용한 지표의 메뉴·기간·단위를 정리해요."
          className="insights-spec"
        />
        <FeaturePanel
          id="M7-F3"
          title="서식4용 문장 복사"
          description="검토한 내용을 제출 문장으로 옮기는 자리예요."
          className="insights-copy"
        />
      </div>
    </div>
  );
}
