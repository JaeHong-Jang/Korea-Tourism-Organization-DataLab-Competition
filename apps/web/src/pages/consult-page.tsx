// 대화와 예보팀 작업판, 예보서 미리보기의 비율을 잡는다.
import { FeaturePanel } from "../components/common/feature-panel";
import { PageHeading } from "../components/common/page-heading";
import { Button } from "../components/ui/button";

// 대화 영역은 넉넉한 입력 공간을 두고 결과 영역은 위아래로 나눈다.
export function ConsultPage() {
  return (
    <div className="consult-page page-wrap">
      <PageHeading
        eyebrow="S2 · 행사 정보를 함께 정리해요"
        title="예보 상담"
        description="행사를 설명하면 예보팀의 작업과 결과를 이곳에서 이어서 볼 수 있어요."
      />
      <div className="consult-layout">
        <FeaturePanel
          id="M2-F1"
          title="대화"
          description="행사 장소와 일정을 알려 주세요. 필요한 내용은 다시 물어볼게요."
          className="consult-chat"
        >
          <div className="consult-chat__space" aria-hidden="true" />
          <div className="chat-input-placeholder">
            <span>행사를 설명해 주세요…</span>
            <Button size="sm" disabled>
              보내기
            </Button>
          </div>
        </FeaturePanel>
        <div className="consult-right">
          <FeaturePanel
            id="M2-F3"
            title="예보팀 작업판"
            description="분석·검증·보고팀이 어떤 단계에 있는지 보여 드려요."
            className="team-board"
          />
          <FeaturePanel
            id="M2-F4"
            title="예보서 미리보기"
            description="검증을 마친 수치와 문장이 이곳에 나타나요."
            className="report-preview"
          >
            <div className="report-preview__skeleton" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </FeaturePanel>
          <FeaturePanel
            id="M2-F2"
            title="행사 카드"
            description="알려 주신 행사 정보와 확인이 필요한 항목을 모아 보여 드려요."
            className="event-summary"
          />
        </div>
      </div>
    </div>
  );
}
