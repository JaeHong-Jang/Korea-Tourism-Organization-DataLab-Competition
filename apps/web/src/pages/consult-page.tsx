// 대화, 행사 카드, 예보팀과 숫자 미리보기를 한 상담 흐름으로 연결한다.
import type {
  AgentStatus,
  EventDraft,
  ForecastCard,
  GateReport,
  SseEvent,
} from "@crowdcast/contracts/types";
import { useEffect, useRef, useState } from "react";
import { ErrorState } from "../components/common/error-state";
import { FeaturePanel } from "../components/common/feature-panel";
import { PageHeading } from "../components/common/page-heading";
import { PetAvatar } from "../components/pets";
import { Button } from "../components/ui/button";
import type { Ask } from "../features/consult-chat/answers";
import { AskReply } from "../features/consult-chat/ask-reply";
import { EventDraftCard } from "../features/consult-chat/event-draft-card";
import { ForecastPreview } from "../features/consult-chat/forecast-preview";
import { TeamBoard } from "../features/team-board/team-board";
import { createTeamSession } from "../lib/api-client";
import { postTeamMessage } from "../lib/team-stream/stream";

const examples = [
  "10월 18일 영종 씨사이드파크에서 불꽃축제를 해요",
  "11월 7일 서울숲에서 작은 음악 공연을 해요",
  "5월 15일 전주 한옥마을에서 먹거리 행사를 해요",
];
type Message = { text: string; answer?: object };

// 스트림에서 검증된 이벤트만 현재 상담 화면 상태에 반영한다.
export function ConsultPage() {
  const [text, setText] = useState("");
  const [sent, setSent] = useState<{ id: string; text: string }[]>([]);
  const [asks, setAsks] = useState<Ask[]>([]);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [statuses, setStatuses] = useState<AgentStatus[]>([]);
  const [gates, setGates] = useState<GateReport[]>([]);
  const [card, setCard] = useState<ForecastCard | null>(null);
  const [forecastId, setForecastId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<
    { id: string; label: string }[]
  >([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState("행사를 적어 주세요.");
  const session = useRef<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const lastMessage = useRef<Message | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  // 문장·근거 이벤트는 다음 화면 task에서 발행 검증과 함께 표시한다.
  const handleEvent = (event: SseEvent) => {
    switch (event.event) {
      case "agent_status":
        setStatuses((current) => [...current, event.data as AgentStatus]);
        break;
      case "event_card":
        setDraft(event.data as EventDraft);
        setSummary("행사 정보를 확인했어요.");
        break;
      case "ask":
        setAsks((current) => [...current, event.data as Ask]);
        setSummary("확인이 필요한 항목이 있어요.");
        break;
      case "gate": {
        const gate = event.data as GateReport;
        setGates((current) => [...current, gate]);
        setSummary(
          gate.passed
            ? `게이트 ${gate.gate}를 통과했어요.`
            : `게이트 ${gate.gate}에서 멈췄어요.`,
        );
        break;
      }
      case "forecast":
        setCard(event.data as ForecastCard);
        setSummary("숫자 예보를 확인했어요.");
        break;
      case "suggest":
        setSuggestions(
          (event.data as { actions: { id: string; label: string }[] }).actions,
        );
        break;
      case "done":
        setForecastId((event.data as { forecastId: string | null }).forecastId);
        break;
      case "error":
        setError((event.data as { message: string }).message);
        break;
    }
  };

  // 첫 메시지는 새 세션을 만들고 되묻기는 같은 세션으로 이어 보낸다.
  const send = async (message: Message) => {
    if (!message.text.trim() || busy) return;
    const abort = new AbortController();
    controller.current = abort;
    lastMessage.current = message;
    setBusy(true);
    setError("");
    setAsks([]);
    setSent((current) => [
      ...current,
      { id: crypto.randomUUID(), text: message.text },
    ]);
    setText("");
    setSummary("예보팀이 확인하고 있어요.");
    try {
      session.current ??= await createTeamSession(abort.signal);
      await postTeamMessage(
        session.current,
        message,
        abort.signal,
        handleEvent,
      );
    } catch (cause) {
      if (abort.signal.aborted) setSummary("상담을 중단했어요.");
      else {
        setCard(null);
        setForecastId(null);
        setError(
          cause instanceof Error ? cause.message : "상담 연결을 확인해 주세요.",
        );
      }
    } finally {
      setBusy(false);
      controller.current = null;
    }
  };

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
            {sent.map((message) => (
              <p
                className="consult-bubble consult-bubble--user"
                key={message.id}
              >
                {message.text}
              </p>
            ))}
            {asks.map((ask) => (
              <AskReply
                key={`${ask.field}-${ask.question}`}
                ask={ask}
                draft={draft}
                disabled={busy}
                onReply={(reply) => void send(reply)}
              />
            ))}
            {suggestions.length > 0 && (
              <fieldset className="consult-choices" aria-label="다음 할 일">
                {suggestions.map((suggestion) => (
                  <button type="button" disabled key={suggestion.id}>
                    {suggestion.label}
                  </button>
                ))}
              </fieldset>
            )}
            {error && (
              <ErrorState
                message={error}
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
          <form
            className="consult-compose"
            onSubmit={(event) => {
              event.preventDefault();
              const field = asks.find(
                (item) => item.field !== "time" && item.field !== "hazards",
              )?.field;
              void send(field ? { text, answer: { [field]: text } } : { text });
            }}
          >
            <label htmlFor="consult-text">행사를 설명해 주세요</label>
            <textarea
              id="consult-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={3}
              placeholder="행사 날짜, 장소, 종류를 적어 주세요"
              disabled={busy}
            />
            <div className="consult-compose__actions">
              <Button type="submit" disabled={busy || !text.trim()}>
                보내기
              </Button>
              {busy && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => controller.current?.abort()}
                >
                  중단
                </Button>
              )}
            </div>
          </form>
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
            <ForecastPreview card={card} forecastId={forecastId} />
          </FeaturePanel>
          <FeaturePanel
            id="M2-F2"
            title="행사 카드"
            description="채운 값은 실선, 확인할 값은 점선으로 표시해요."
            className="event-summary"
          >
            <EventDraftCard
              draft={draft}
              onEdit={(message) => void send(message)}
              disabled={busy}
            />
          </FeaturePanel>
        </div>
      </div>
    </div>
  );
}
