// 요청의 오류·취소·완료를 한곳에서 처리해 스트림을 done으로 끝낸다
import { RequestTimeoutError } from "../../clients/request-deadline.js";
import { ServiceHttpError } from "../../clients/request-json.js";
import type { TeamMessage } from "../analysis/draft-answer.js";
import type { Deadline } from "../lead/deadline.js";
import { AnalysisGateError, ExplanationGateError } from "../lead/gates.js";
import { newForecast } from "../lead/playbooks.js";
import type { EventWriter } from "./events.js";
import { createExecutor } from "./executor.js";
import type { TeamSession } from "./sessions.js";
import type { TeamSettings } from "./settings.js";

// 원문 예외 대신 계약 오류 코드와 안전한 안내 문구만 전송한다
function errorCard(error: unknown) {
  if (error instanceof ExplanationGateError)
    return {
      code: "SERVICE_UNAVAILABLE" as const,
      message: "설명 문장을 검증하지 못했어요",
    };
  if (error instanceof RequestTimeoutError)
    return {
      code: "DEADLINE_EXCEEDED" as const,
      message: "요청 시간이 지났어요. 다시 시도해 주세요.",
    };
  if (
    error instanceof AnalysisGateError ||
    (error instanceof ServiceHttpError && [409, 422].includes(error.status))
  )
    return {
      code: "ANALYSIS_GATE_FAILED" as const,
      message:
        "분석 근거를 검증하지 못했어요. 행사 정보와 근거를 확인해 주세요.",
    };
  return {
    code: "SERVICE_UNAVAILABLE" as const,
    message: "분석 서비스를 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
  };
}

// 연결 종료도 마감을 취소해 이후의 그래프 쓰기와 LLM 호출을 중단한다
export async function runRequest(
  session: TeamSession,
  message: TeamMessage,
  writer: EventWriter,
  settings: TeamSettings,
  disconnected: AbortSignal,
  deadline: Deadline,
) {
  const previousForecastId = session.forecastId;
  const cancel = () => deadline.abort(disconnected.reason);
  disconnected.addEventListener("abort", cancel, { once: true });
  if (disconnected.aborted) cancel();
  try {
    if (session.completed || (session.analyzed && message.answer != null)) {
      await writer.emit("error", {
        code: "OUT_OF_SCOPE",
        message: "새 예보는 새 상담에서 시작해 주세요.",
      });
      return;
    }
    await newForecast(
      session,
      message,
      createExecutor(session.id, settings, deadline, writer),
      writer,
      deadline,
      settings,
    );
  } catch (error) {
    deadline.abort(error);
    await writer.emit("error", errorCard(error));
  } finally {
    try {
      await writer.emit("done", {
        sessionId: session.id,
        forecastId:
          session.forecastId !== previousForecastId
            ? (session.forecastId ?? null)
            : null,
      });
    } finally {
      deadline.dispose();
      disconnected.removeEventListener("abort", cancel);
      session.busy = false;
    }
  }
}
