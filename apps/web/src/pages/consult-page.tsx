// 대화, 행사 카드, 예보팀과 숫자 미리보기를 한 상담 흐름으로 연결한다.

import { ErrorState } from "../components/common/error-state";
import { FeaturePanel } from "../components/common/feature-panel";
import { PageHeading } from "../components/common/page-heading";
import { PetAvatar } from "../components/pets";
import { Button } from "../components/ui/button";
import { AskReply } from "../features/consult-chat/ask-reply";
import { ConsultInput } from "../features/consult-chat/consult-input";
import { ConsultMessages } from "../features/consult-chat/consult-messages";
import { EventDraftCard } from "../features/consult-chat/event-draft-card";
import { whatIfChips } from "../features/consult-chat/followup-chips";
import { ForecastComparison } from "../features/consult-chat/forecast-comparison";
import { ForecastPreview } from "../features/consult-chat/forecast-preview";
import { useConsultSession } from "../features/consult-chat/use-consult-session";
import { TeamBoard } from "../features/team-board/team-board";

const examples = [
  "10월 18일 19시부터 21시까지 영종 씨사이드파크에서 인천 중구가 여는 불꽃축제를 해요",
  "11월 7일 14시부터 17시까지 서울숲에서 작은 음악 공연을 해요",
  "5월 15일 11시부터 16시까지 전주 한옥마을에서 먹거리 행사를 해요",
];

// 상담 흐름의 현재 상태를 문서 순서대로 배치한다.
export function ConsultPage() {
  const {
    text,
    setText,
    sent,
    asks,
    draft,
    statuses,
    stepCounts,
    gates,
    forecasts,
    forecastId,
    suggestions,
    claims,
    evidence,
    error,
    replyError,
    busy,
    summary,
    session,
    controller,
    lastMessage,
    send,
  } = useConsultSession();
  const original = forecasts[0];
  const changed = forecasts.length > 1 ? forecasts.at(-1) : null;
  const followups = ["왜 이렇게 많아?", ...whatIfChips(draft)];
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
          <div className="consult-conversation">
            <div className="consult-greeting">
              <PetAvatar agentId="lead" state="idle" size={48} />
              <p>안녕하세요. 어떤 행사를 준비하시나요?</p>
            </div>
            {!sent.length && (
              <div className="consult-examples">
                {examples.map((example) => (
                  <button
                    type="button"
                    key={example}
                    onClick={() => void send({ text: example })}
                    disabled={busy}
                  >
                    {example}
                  </button>
                ))}
              </div>
            )}
            <ConsultMessages sent={sent} claims={claims} evidence={evidence} />
            {asks.length > 0 && (
              <AskReply
                key={asks.map((ask) => ask.field).join("-")}
                asks={asks}
                draft={draft}
                disabled={busy}
                replyError={replyError}
                onReply={(reply) => void send(reply)}
              />
            )}
            {forecastId && asks.length === 0 && (
              <fieldset className="consult-choices" aria-label="다음 할 일">
                <legend className="sr-only">후속 질문과 다음 할 일</legend>
                {followups.map((question) => (
                  <button
                    type="button"
                    disabled={busy}
                    key={question}
                    onClick={() => void send({ text: question })}
                  >
                    {question}
                  </button>
                ))}
                {suggestions.map((suggestion) =>
                  suggestion.href ? (
                    <a href={suggestion.href} key={suggestion.id}>
                      {suggestion.label}
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      key={suggestion.id}
                      onClick={() => void send({ text: suggestion.label })}
                    >
                      {suggestion.label}
                    </button>
                  ),
                )}
              </fieldset>
            )}
            {error && (
              <ErrorState
                message="상담을 이어가지 못했어요. 같은 내용을 다시 보내 주세요."
                action={
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (lastMessage.current) void send(lastMessage.current);
                    }}
                  >
                    다시 시도
                  </Button>
                }
              />
            )}
          </div>
          <p className="consult-live" aria-live="polite">
            {summary}
          </p>
          <ConsultInput
            text={text}
            onText={setText}
            busy={busy}
            answering={asks.length > 0}
            onSubmit={() => void send({ text })}
            onStop={() => controller.current?.abort()}
          />
        </FeaturePanel>
        <div className="consult-right">
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
    </div>
  );
}
