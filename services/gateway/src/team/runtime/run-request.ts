// 요청의 오류·취소·완료를 한곳에서 처리해 스트림을 done으로 끝낸다
import { RequestTimeoutError } from "../../clients/request-deadline.js";
import { ServiceHttpError } from "../../clients/request-json.js";
import { koreanToday } from "../analysis/as-of.js";
import type { TeamMessage } from "../analysis/draft-answer.js";
import { ruleIntents } from "../lead/classify.js";
import type { Deadline } from "../lead/deadline.js";
import { followup } from "../lead/followups.js";
import { AnalysisGateError, ExplanationGateError } from "../lead/gates.js";
import { newForecast } from "../lead/playbooks.js";
import { rulePurpose } from "../lead/purpose.js";
import { emitReply } from "../lead/reply.js";
import { collectReplyFacts } from "../lead/reply-facts.js";
import { selectedEvent } from "../lead/selected-event.js";
import { startConsultation } from "../lead/start.js";
import { recommendFestivals } from "../recommend/run.js";
import { isInitialWhatif } from "../whatif/intent.js";
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
  const previousPublication = session.published;
  const isFollowup = session.completed;
  let newMode = !isFollowup;
  let recommendation = false;
  const today = koreanToday();
  const cancel = () => deadline.abort(disconnected.reason);
  disconnected.addEventListener("abort", cancel, { once: true });
  if (disconnected.aborted) cancel();
  const reply = collectReplyFacts(writer);
  writer = reply.writer;
  const execute = createExecutor(
    session.published?.report.sessionId ?? session.id,
    settings,
    deadline,
    writer,
  );
  try {
    // 행사 선택은 원문의 분류·추출보다 우선하며 기존 발행본이 있어도 새 예보다
    if (message.eventId) {
      newMode = true;
      await selectedEvent(
        session,
        message.eventId,
        writer,
        deadline,
        settings,
        today,
      );
      return;
    }
    if (
      !session.pendingPurpose &&
      (!isFollowup ||
        /추천|가고\s*싶|갈\s*만한|구경|놀러|데이트/.test(message.text) ||
        !ruleIntents(message.text).some((intent) =>
          ["why", "save", "draft", "whatif"].includes(intent),
        )) &&
      (rulePurpose(message.text) === "recommend" ||
        (message.near && rulePurpose(message.text) !== "new")) &&
      !message.answer
    ) {
      recommendation = true;
      await recommendFestivals(
        message.text,
        today,
        execute,
        writer,
        deadline,
        settings,
        message.near,
      );
      return;
    }
    if (isFollowup) {
      await followup(
        session,
        message,
        execute,
        writer,
        deadline,
        settings,
        today,
        () => {
          newMode = true;
        },
      );
      return;
    }
    // 예보가 없는 조건 질문에는 받아쓰기·추정 없이 선행 작업을 안내한다
    if (!message.answer && isInitialWhatif(message.text)) {
      await writer.emit("error", {
        code: "OUT_OF_SCOPE",
        message: "먼저 예보를 만들어요",
      });
      return;
    }
    // 발행 전의 단독 저장 명령만 안내하고 되묻기 답은 기존 분석으로 이어 간다
    if (
      !message.answer &&
      /^(?:예보서(?:를)?\s*)?(?:저장|보관)(?:해\s*(?:줘|주세요))?[.!?\s]*$/.test(
        message.text.trim(),
      )
    ) {
      await writer.emit("error", {
        code: "OUT_OF_SCOPE",
        message: "먼저 예보를 받아야 저장할 수 있어요",
      });
      return;
    }
    if (session.analyzed && message.answer != null) {
      await writer.emit("error", {
        code: "OUT_OF_SCOPE",
        message: "새 예보는 새 상담에서 시작해 주세요.",
      });
      return;
    }
    const initial = await startConsultation(
      session,
      message,
      execute,
      writer,
      deadline,
      settings,
      today,
    );
    if (!initial) return;
    await newForecast(
      session,
      initial,
      execute,
      writer,
      deadline,
      settings,
      today,
    );
  } catch (error) {
    deadline.abort(error);
    await writer.emit("error", errorCard(error));
  } finally {
    try {
      await emitReply(reply.facts, execute, writer, deadline);
      await writer.emit("done", {
        sessionId: session.id,
        forecastId: recommendation
          ? null
          : !newMode
            ? (previousForecastId ?? null)
            : session.published !== previousPublication
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
