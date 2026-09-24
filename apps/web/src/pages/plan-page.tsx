// 계획 초안의 내려받기와 편집 영역을 구분한다.
import { FeaturePanel } from "../components/common/feature-panel";
import { PageHeading } from "../components/common/page-heading";

// 내려받기 안내 다음에 목차와 편집기 자리를 나란히 둔다.
export function PlanPage() {
  return (
    <div className="page-wrap regular-page">
      <PageHeading
        eyebrow="S4 · 예보 결과를 계획으로"
        title="계획 초안"
        description="검토가 필요한 문장을 확인하고 계획서에 옮겨 보세요."
      />
      <div className="plan-layout">
        <FeaturePanel
          id="M4-F1"
          title="초안 받기"
          description="예보서의 근거와 수치를 담은 문서가 준비되면 내려받을 수 있어요."
        />
        <FeaturePanel
          id="M4-F2"
          title="편집기"
          description="목차별 상태를 확인하고 문장을 다듬는 공간이에요."
        />
      </div>
    </div>
  );
}
