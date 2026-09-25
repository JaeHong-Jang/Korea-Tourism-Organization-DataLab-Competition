// 전역 상담 세션의 대화·되묻기·후속 질문을 오른쪽 서랍에 모은다.
import { useEffect, useRef } from "react";
import { ErrorState } from "../../components/common/error-state";
import { PetAvatar } from "../../components/pets";
import { Button } from "../../components/ui/button";
import {
  useAssistantStore,
  useSharedConsultSession,
} from "../../lib/consult-store";
import { AskReply } from "../consult-chat/ask-reply";
import { ConsultInput } from "../consult-chat/consult-input";
import { ConsultMessages } from "../consult-chat/consult-messages";
import { consultErrorMessage } from "../consult-chat/error-message";
import { whatIfChips } from "../consult-chat/followup-chips";
import { FestivalPicker } from "./festival-picker";
import { RecommendationCards } from "./recommendation-cards";

const examples = ["불꽃놀이 행사에 가고 싶어", "행사를 직접 설명할게요"];

// 화면 밖에서 고른 행사는 입력을 채우지 않고 eventId를 넣어 바로 전송한다.
export function AssistantPanel() {
  const session = useSharedConsultSession();
  const {
    text,
    setText,
    sent,
    asks,
    draft,
    forecastId,
    suggestions,
    claims,
    evidence,
    error,
    replyError,
    busy,
    summary,
    recommendation,
    controller,
    lastMessage,
    send,
  } = session;
  const closePanel = useAssistantStore((state) => state.closePanel);
  const requestedFestival = useAssistantStore(
    (state) => state.requestedFestival,
  );
  const clearRequest = useAssistantStore((state) => state.clearRequest);
  const panelRef = useRef<HTMLElement>(null);
  const pick = (festival: { name: string; eventId: string }) =>
    void send({
      text: `${festival.name} 예보해 줘`,
      eventId: festival.eventId,
    });

  // 버튼으로 열린 서랍은 제목에 초점을 두고 대기 중 요청을 한 번만 소비한다.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!requestedFestival || busy) return;
    clearRequest();
    void send({
      text: `${requestedFestival.name} 예보해 줘`,
      eventId: requestedFestival.eventId,
    });
  }, [requestedFestival, busy, clearRequest, send]);

  return (
    <aside
      className="assistant-panel"
      aria-label="고래 봇 대화"
      tabIndex={-1}
      ref={panelRef}
    >
      <header className="assistant-panel__header">
        <div>
          <strong>고래 봇</strong>
          <p>행사를 고르거나 궁금한 것을 물어보세요.</p>
        </div>
        <button type="button" onClick={closePanel} aria-label="대화 닫기">
          닫기
        </button>
      </header>
      <div className="assistant-panel__conversation">
        {!sent.length && (
          <>
            <div className="consult-greeting">
              <PetAvatar agentId="lead" state="idle" size={48} />
              <p>안녕하세요. 어떤 행사를 찾으시나요?</p>
            </div>
            <FestivalPicker onPick={pick} />
            <div className="consult-examples">
              {examples.map((example) => (
                <button
                  key={example}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    example === examples[1]
                      ? document.getElementById("consult-text")?.focus()
                      : void send({ text: example })
                  }
                >
                  {example}
                </button>
              ))}
            </div>
          </>
        )}
        <ConsultMessages sent={sent} claims={claims} evidence={evidence} />
        {recommendation && (
          <RecommendationCards
            recommendation={recommendation}
            onChangeConditions={() => {
              setText("다른 지역이나 날짜로 찾아줘");
              document.getElementById("consult-text")?.focus();
            }}
          />
        )}
        {forecastId && !asks.length && (
          <fieldset className="consult-choices" aria-label="다음 할 일">
            <legend className="sr-only">후속 질문과 다음 할 일</legend>
            {["왜 이렇게 많아?", ...whatIfChips(draft)].map((question) => (
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
                <a key={suggestion.id} href={suggestion.href}>
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
            message={consultErrorMessage(error)}
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
      {asks.length ? (
        <AskReply
          key={asks.map((ask) => ask.field).join("-")}
          asks={asks}
          draft={draft}
          disabled={busy}
          replyError={replyError}
          text={text}
          onText={setText}
          onStop={() => controller.current?.abort()}
          onReply={(reply) => void send(reply)}
        />
      ) : (
        <ConsultInput
          text={text}
          onText={setText}
          busy={busy}
          answering={false}
          onSubmit={() => void send({ text })}
          onStop={() => controller.current?.abort()}
        />
      )}
    </aside>
  );
}
