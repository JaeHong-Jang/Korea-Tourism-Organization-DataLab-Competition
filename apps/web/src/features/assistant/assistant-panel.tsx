// 전역 상담 세션의 대화·되묻기·후속 질문을 오른쪽 서랍에 모은다.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { AssistantNextActions } from "./assistant-next-actions";
import { FestivalPicker } from "./festival-picker";
import { RecommendationCards } from "./recommendation-cards";
import { useConversationScroll } from "./use-conversation-scroll";

const examples = ["불꽃놀이 행사에 가고 싶어", "행사를 직접 설명할게요"];

// 화면 밖에서 고른 행사는 입력을 채우지 않고 eventId를 넣어 바로 전송한다.
export function AssistantPanel({ onGuide }: { onGuide: () => void }) {
  const navigate = useNavigate();
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
    forecasts,
    replies,
    work,
    gateReplies,
    completed,
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
  const takeRequest = useAssistantStore((state) => state.takeRequest);
  const panelRef = useRef<HTMLElement>(null);
  const { viewportRef, contentRef } = useConversationScroll(sent.at(-1)?.id);
  const [nearError, setNearError] = useState("");
  // 대화창에서 선택한 행사도 상담 페이지에서 진행 상황을 바로 보여 준다.
  const pick = (festival: { name: string; eventId: string }) => {
    navigate("/consult");
    void send({
      text: `${festival.name} 예보해 줘`,
      eventId: festival.eventId,
    });
  };

  // 위치는 허락받은 한 번의 메시지에만 넣고 저장하지 않는다.
  const findNear = () => {
    if (!navigator.geolocation) {
      setNearError("지역 이름을 말해 주세요.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (
          coords.latitude < 33 ||
          coords.latitude > 39 ||
          coords.longitude < 124 ||
          coords.longitude > 132
        ) {
          setNearError("지역 이름을 말해 주세요.");
          return;
        }
        setNearError("");
        void send({
          text: "내 위치에서 가까운 축제 찾아줘",
          near: { lat: coords.latitude, lng: coords.longitude },
        });
      },
      () => setNearError("지역 이름을 말해 주세요."),
      { enableHighAccuracy: false, timeout: 10000 },
    );
  };

  // 버튼으로 열린 서랍은 제목에 초점을 두고 대기 중 요청을 한 번만 소비한다.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!requestedFestival || busy) return;
    const festival = takeRequest();
    if (!festival) return;
    navigate("/consult");
    void send({
      text: `${festival.name} 예보해 줘`,
      eventId: festival.eventId,
    });
  }, [requestedFestival, busy, takeRequest, send, navigate]);

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
        <button type="button" onClick={onGuide}>
          사용법 +
        </button>
      </header>
      <div className="assistant-panel__conversation" ref={viewportRef}>
        <div className="assistant-panel__messages" ref={contentRef}>
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
          <ConsultMessages
            sent={sent}
            claims={claims}
            forecasts={forecasts}
            replies={replies}
            work={work}
            gateReplies={gateReplies}
            completed={completed}
            busy={busy}
          />
          {recommendation && (
            <RecommendationCards
              recommendation={recommendation}
              onChangeConditions={() => {
                setText("다른 지역이나 날짜로 찾아줘");
                document.getElementById("consult-text")?.focus();
              }}
            />
          )}
          {forecastId && !busy && !error && !asks.length && (
            <AssistantNextActions
              forecastId={forecastId}
              draft={draft}
              suggestions={suggestions}
              onAsk={(text) => void send({ text })}
            />
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
      </div>
      <p className="consult-live" aria-live="polite">
        {nearError || summary}
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
          context={
            error
              ? "error"
              : recommendation
                ? "recommendation"
                : forecastId
                  ? "forecast"
                  : sent.length
                    ? "continuing"
                    : "initial"
          }
          text={text}
          onText={setText}
          busy={busy}
          answering={false}
          onSubmit={() => void send({ text })}
          onStop={() => controller.current?.abort()}
          onNear={findNear}
        />
      )}
    </aside>
  );
}
