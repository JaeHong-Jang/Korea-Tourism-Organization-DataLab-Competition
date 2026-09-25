// 상담 스트림의 상태와 메시지 전송을 화면 밖에서 관리한다.
import type {
  AgentStatus,
  AgentStep,
  Claim,
  EventDraft,
  Evidence,
  ForecastCard,
  GateReport,
  SseEvent,
} from "@crowdcast/contracts/types";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { createTeamSession } from "../../lib/api-client";
import type { Ask } from "./answers";
import { postConsultMessage } from "./post-consult-message";

export type Message = { text: string; answer?: object };
export type ClaimReply = { messageId: string; claim: Claim };
export type ForecastSnapshot = {
  card: ForecastCard;
  draft: EventDraft | null;
  request: string;
};

// 검증된 스트림 이벤트만 상담 상태에 반영한다.
export function useConsultSession() {
  const [searchParams] = useSearchParams();
  const [text, setText] = useState(() => searchParams.get("text") ?? "");
  const [sent, setSent] = useState<{ id: string; text: string }[]>([]);
  const [asks, setAsks] = useState<Ask[]>([]);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [statuses, setStatuses] = useState<AgentStatus[]>([]);
  const [stepCounts, setStepCounts] = useState<Record<string, number>>({});
  const [gates, setGates] = useState<GateReport[]>([]);
  const [forecasts, setForecasts] = useState<ForecastSnapshot[]>([]);
  const [forecastId, setForecastId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<
    { id: string; label: string; href?: string }[]
  >([]);
  const [claims, setClaims] = useState<ClaimReply[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [error, setError] = useState("");
  const [replyError, setReplyError] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState("행사를 적어 주세요.");
  const session = useRef<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const lastMessage = useRef<Message | null>(null);
  const requestId = useRef<string | null>(null);
  const draftRef = useRef<EventDraft | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  // 검증된 이벤트의 카드·문장·근거를 요청 순서에 맞게 누적한다.
  const handleEvent = (event: SseEvent) => {
    switch (event.event) {
      case "agent_status":
        setStatuses((current) => [...current, event.data as AgentStatus]);
        break;
      case "agent_step": {
        const step = event.data as AgentStep;
        setStepCounts((current) => ({
          ...current,
          [step.agentId]: (current[step.agentId] ?? 0) + 1,
        }));
        break;
      }
      case "event_card":
        draftRef.current = event.data as EventDraft;
        setDraft(draftRef.current);
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
            ? `${gate.gate === "A" ? "분석 검증" : gate.gate === "B" ? "문장 검증" : "발행"}을 통과했어요.`
            : `${gate.gate === "A" ? "분석 검증" : gate.gate === "B" ? "문장 검증" : "발행"}에서 멈췄어요.`,
        );
        break;
      }
      case "forecast": {
        const next = event.data as ForecastCard;
        setForecasts((current) =>
          current.some((item) => item.card.id === next.id)
            ? current
            : [
                ...current,
                {
                  card: next,
                  draft: draftRef.current,
                  request: lastMessage.current?.text ?? "",
                },
              ],
        );
        setSummary("숫자 예보를 확인했어요.");
        break;
      }
      case "claim":
        setClaims((current) => [
          ...current,
          { messageId: requestId.current ?? "", claim: event.data as Claim },
        ]);
        break;
      case "evidence":
        setEvidence((current) => [
          ...current,
          ...(event.data as { items: Evidence[] }).items,
        ]);
        break;
      case "suggest":
        setSuggestions(
          (
            event.data as {
              actions: { id: string; label: string; href?: string }[];
            }
          ).actions,
        );
        break;
      case "done":
        setForecastId(
          (current) =>
            (event.data as { forecastId: string | null }).forecastId ?? current,
        );
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
    setReplyError("");
    const messageId = crypto.randomUUID();
    requestId.current = messageId;
    setSent((current) => [...current, { id: messageId, text: message.text }]);
    setText("");
    setSummary("예보팀이 확인하고 있어요.");
    try {
      session.current ??= await createTeamSession(abort.signal);
      let firstEvent = true;
      await postConsultMessage(
        session.current,
        message,
        abort.signal,
        forecastId,
        (event) => {
          // 응답이 실제로 시작할 때 이전 질문을 지워 400이면 입력을 보존한다.
          if (firstEvent) {
            setAsks([]);
            firstEvent = false;
          }
          handleEvent(event);
        },
      );
    } catch (cause) {
      if (abort.signal.aborted) setSummary("상담을 중단했어요.");
      else if (
        message.answer &&
        cause instanceof Error &&
        cause.message === "상담 연결 실패: 400"
      ) {
        setSent((current) => current.filter((item) => item.id !== messageId));
        setReplyError("답을 확인해 주세요. 고쳐서 다시 보내 주세요.");
      } else {
        setError(
          cause instanceof Error ? cause.message : "상담 연결을 확인해 주세요.",
        );
      }
    } finally {
      setBusy(false);
      controller.current = null;
    }
  };
  return {
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
  };
}
