// 저장한 행사로 격리된 예보·검증·발행을 실행하고 스냅샷을 추가한다
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { createRecordsClient } from "../../clients/records-client.js";
import { ServiceHttpError } from "../../clients/request-json.js";
import { koreanToday } from "../analysis/as-of.js";
import type { Deadline } from "../lead/deadline.js";
import { forecastEvent } from "../lead/forecast-event.js";
import { AnalysisGateError, ExplanationGateError } from "../lead/gates.js";
import { knowledgeClient, publishForecastReport } from "../lead/publish.js";
import { createEventWriter } from "../runtime/events.js";
import { createExecutor } from "../runtime/executor.js";
import type { TeamSession } from "../runtime/sessions.js";
import type { TeamSettings } from "../runtime/settings.js";
import { ReforecastError } from "./error.js";
import { previousSnapshot, reforecastResult } from "./result.js";

// records 읽기 오류 중 행사 자체의 404만 사용자에게 행사 부재로 돌려준다
export async function runReforecast(
  eventId: string,
  settings: TeamSettings,
  deadline: Deadline,
  disconnected: AbortSignal,
) {
  const today = koreanToday();
  const records = createRecordsClient({
    baseUrl: settings.config.services.records,
    fetch: settings.fetcher,
    signal: deadline.controller.signal,
    timeoutMs: Math.min(5_000, settings.deadlineMs),
  });
  const event = await records.getEvent(eventId).catch((error: unknown) => {
    if (error instanceof ServiceHttpError && error.status === 404)
      throw new ReforecastError(
        404,
        "event_not_found",
        "저장한 행사를 찾을 수 없어요.",
      );
    throw error;
  });
  if (event.id !== eventId) throw new Error("저장한 행사 응답 계약 위반");
  const snapshots = await records.getSnapshots(eventId);
  const before = previousSnapshot(eventId, snapshots);

  // 상담 저장소에 등록하지 않는 별도 접두어로 근거와 작업 기록을 격리한다
  const session: TeamSession = {
    id: `s-reforecast-${randomUUID()}`,
    steps: [],
    askedFields: [],
    hazardCandidates: [],
    hazardsConfirmed: true,
    busy: true,
    analyzed: true,
    completed: false,
  };
  const writer = createEventWriter(
    session,
    settings,
    randomUUID(),
    async () => {},
    deadline,
    disconnected,
  );
  const execute = createExecutor(session.id, settings, deadline, writer);
  let stage: "A" | "B" | "records" = "A";
  try {
    await knowledgeClient(settings, deadline).addFacts(session.id, {
      schema: "event",
      items: [event],
    });
    const { bundle, gate } = await forecastEvent(
      session.id,
      event,
      { baseline: null, similar: [] },
      execute,
      writer,
      deadline,
      settings,
      today,
    );
    if (snapshots.some((report) => report.forecastId === bundle.forecast.id))
      throw new Error("새 예보 식별자 응답 계약 위반");

    // 상담과 같은 보고팀·재작성 상한·게이트 B·원자적 발행을 사용한다
    stage = "B";
    const report = await publishForecastReport(
      session,
      event,
      bundle,
      gate,
      execute,
      writer,
      deadline,
      settings,
    );
    stage = "records";
    const saved = await records.saveSnapshot(eventId, report);
    if (!isDeepStrictEqual(saved, report))
      throw new Error("저장 스냅샷 응답 계약 위반");
    return reforecastResult(before, saved, today);
  } catch (error) {
    const gateFailed =
      stage !== "records" &&
      (error instanceof AnalysisGateError ||
        error instanceof ExplanationGateError ||
        (error instanceof ServiceHttpError &&
          [409, 422].includes(error.status)));
    await writer.emit("error", {
      code:
        gateFailed && stage === "A"
          ? "ANALYSIS_GATE_FAILED"
          : "SERVICE_UNAVAILABLE",
      message: gateFailed
        ? `게이트 ${stage} 검증을 통과하지 못했어요.`
        : "재예보를 완료하지 못했어요.",
    });
    if (gateFailed)
      throw new ReforecastError(
        409,
        stage === "A" ? "ANALYSIS_GATE_FAILED" : "EXPLANATION_GATE_FAILED",
        `게이트 ${stage} 검증을 통과하지 못해 재예보를 저장하지 않았어요.`,
      );
    throw error;
  } finally {
    await writer.emit("done", {
      sessionId: session.id,
      forecastId: session.forecastId ?? null,
    });
  }
}
