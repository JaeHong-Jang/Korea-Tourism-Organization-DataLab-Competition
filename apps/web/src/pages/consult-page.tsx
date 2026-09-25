// 공유 상담 세션의 작업판·예보서·행사 카드만 한 화면에 보여 준다.
import { FeaturePanel } from "../components/common/feature-panel";
import { PageHeading } from "../components/common/page-heading";
import { EventDraftCard } from "../features/consult-chat/event-draft-card";
import { ForecastComparison } from "../features/consult-chat/forecast-comparison";
import { ForecastPreview } from "../features/consult-chat/forecast-preview";
import { TeamBoard } from "../features/team-board/team-board";
import {
  useAssistantStore,
  useSharedConsultSession,
} from "../lib/consult-store";

// 패널을 닫아도 보고서 상태는 이 화면과 계속 동기화한다.
export function ConsultPage() {
  const {
    asks,
    draft,
    statuses,
    stepCounts,
    gates,
    forecasts,
    forecastId,
    session,
    sent,
  } = useSharedConsultSession();
  const openPanel = useAssistantStore((state) => state.openPanel);
  const original = forecasts[0];
  const changed = forecasts.length > 1 ? forecasts.at(-1) : null;
  return (
    <div className="consult-page page-wrap">
      <PageHeading
        eyebrow="S2 · 예보팀 진행 상황"
        title="예보 상담"
        description="예보팀의 작업과 발행 준비 상태를 이곳에서 확인하세요."
      />
      {!sent.length && (
        <div className="consult-start" role="status">
          <p>고래를 눌러 행사를 고르거나 설명해 보세요.</p>
          <button
            type="button"
            onClick={() => {
              openPanel();
              document.getElementById("assistant-festival-search")?.focus();
            }}
          >
            행사 고르기
          </button>
        </div>
      )}
      <div className="consult-layout">
        <FeaturePanel
          id="M2-F3"
          title="예보팀 작업판"
          description="팀원의 상태와 검사 결과를 살펴보세요."
          className="team-board"
        >
          <TeamBoard
            statuses={statuses}
            stepCounts={stepCounts}
            gates={gates}
            sessionId={session.current}
          />
        </FeaturePanel>
        <FeaturePanel
          id="M2-F4"
          title="예보서 미리보기"
          description="검증을 마친 숫자를 먼저 보여 드려요."
          className="report-preview"
        >
          {original && changed ? (
            <ForecastComparison
              original={original}
              changed={changed}
              forecastId={forecastId}
            />
          ) : (
            <ForecastPreview
              card={original?.card ?? null}
              forecastId={forecastId}
            />
          )}
        </FeaturePanel>
        <FeaturePanel
          id="M2-F2"
          title="행사 카드"
          description="채운 값은 실선, 확인할 값은 점선으로 표시해요."
          className="event-summary"
        >
          <EventDraftCard
            draft={draft}
            pendingFields={asks.map((ask) => ask.field)}
          />
        </FeaturePanel>
      </div>
    </div>
  );
}
