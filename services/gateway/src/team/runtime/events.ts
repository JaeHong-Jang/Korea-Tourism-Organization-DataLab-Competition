// SSE를 계약 검증 후 직렬 전송하고 같은 순서로 세션 JSONL에 기록한다
import { join } from "node:path";
import type {
  AgentStatus,
  AgentStep,
  EventDraft,
  ForecastCard,
  GateReport,
  SseEvent,
} from "@crowdcast/contracts/types";
import { withRequestDeadline } from "../../clients/request-deadline.js";
import { contractRegistry } from "../../contract/registry.js";
import type { Deadline } from "../lead/deadline.js";
import type { TeamSession } from "./sessions.js";
import type { TeamSettings } from "./settings.js";

type EventData = {
  agent_status: AgentStatus;
  agent_step: AgentStep;
  event_card: EventDraft;
  ask: {
    field: string;
    question: string;
    options: { label: string; value: string }[];
  };
  gate: GateReport;
  forecast: ForecastCard;
  error: {
    code:
      | "ANALYSIS_GATE_FAILED"
      | "SERVICE_UNAVAILABLE"
      | "DEADLINE_EXCEEDED"
      | "OUT_OF_SCOPE";
    message: string;
  };
  done: { sessionId: string; forecastId: string | null };
};
export const validateSseEvent = contractRegistry.getSchema<SseEvent>(
  "https://crowdcast.local/schemas/sse-event.schema.json",
);

// 순번은 요청마다 새로 시작하고 trace의 requestId로 이어진 질문을 구분한다
export function createEventWriter(
  session: TeamSession,
  settings: TeamSettings,
  requestId: string,
  write: (event: SseEvent, signal: AbortSignal) => Promise<void>,
  deadline: Deadline,
  disconnected: AbortSignal,
) {
  let seq = 0;
  let closed = false;
  let pending = Promise.resolve();
  let traceFailed = false;
  const signal = AbortSignal.any([deadline.controller.signal, disconnected]);
  return {
    // 완료를 예약한 뒤에는 지연된 병렬 작업도 이벤트를 추가할 수 없다
    emit<Name extends keyof EventData>(
      event: Name,
      data: EventData[Name],
    ): Promise<void> {
      if (closed) return Promise.resolve();
      if (event === "done") closed = true;
      const operation = pending.then(async () => {
        if (disconnected.aborted) return;
        const finishing =
          event === "error" ||
          event === "done" ||
          event === "agent_step" ||
          (event === "agent_status" &&
            (data as AgentStatus).state !== "working");
        if (!finishing) deadline.check();
        const envelope = { event, seq, data };
        if (!validateSseEvent?.(envelope))
          throw new Error("SSE 이벤트 계약 위반");
        seq++;
        if (event === "agent_step")
          session.steps.push(structuredClone(data as AgentStep));

        // 종료 기록은 짧은 별도 예산으로 보내고 연결이 막히면 전송도 취소한다
        let at = "";
        await withRequestDeadline(
          finishing ? 250 : settings.deadlineMs,
          (sendSignal) => {
            at = new Date().toISOString();
            return write(envelope, sendSignal);
          },
          finishing ? disconnected : signal,
        );
        if (traceFailed) return;

        // 기록 장애는 로그만 남기며 마감으로 멈춘 정상 작업은 오류 경로로 넘긴다
        try {
          await withRequestDeadline(
            finishing ? 250 : settings.deadlineMs,
            (traceSignal) =>
              settings.traceAppend(
                join(settings.traceDirectory, `${session.id}.jsonl`),
                `${JSON.stringify({ requestId, at, ...envelope })}\n`,
                traceSignal,
              ),
            finishing ? disconnected : signal,
          );
        } catch {
          traceFailed = true;
          console.warn(
            "예보팀 trace 기록 실패: 이 요청의 파일 기록을 중단합니다.",
          );
          if (signal.aborted && !finishing) throw signal.reason;
        }
      });
      // 실패한 기록·전송이 뒤의 error·done 예약을 막지 않게 큐를 복구한다
      pending = operation.catch(() => {});
      return operation;
    },
  };
}

export type EventWriter = ReturnType<typeof createEventWriter>;
