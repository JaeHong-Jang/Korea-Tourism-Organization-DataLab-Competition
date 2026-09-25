// 발행 문장으로 구성한 계획을 저장하고 같은 예보의 기존 초안과 다운로드 링크를 돌려준다
import { createRecordsClient } from "../../clients/records-client.js";
import { ServiceHttpError } from "../../clients/request-json.js";
import { planWriter } from "../report/plan-writer.js";
import type { EventWriter } from "../runtime/events.js";
import type { Executor } from "../runtime/executor.js";
import type { TeamSession } from "../runtime/sessions.js";
import type { TeamSettings } from "../runtime/settings.js";
import type { Deadline } from "./deadline.js";

// 저장·충돌 조회 전체를 한 마감으로 묶고 성공한 초안에만 링크를 보낸다
export async function draftPublishedPlan(ctx: {
  session: TeamSession;
  execute: Executor;
  writer: EventWriter;
  deadline: Deadline;
  settings: TeamSettings;
}) {
  const { session, execute, writer, deadline, settings } = ctx;
  const published = session.published;
  if (!published) {
    await writer.emit("error", {
      code: "OUT_OF_SCOPE",
      message: "먼저 예보를 받아야 계획 초안을 만들 수 있어요",
    });
    return;
  }
  try {
    const draft = await execute(
      planWriter,
      published.report,
      "발행 문장을 계획 초안에 배치해요.",
      2,
    );
    const timeoutMs = deadline.budget(5_000, 2);
    const saved = await deadline.run(timeoutMs, async (signal) => {
      const records = createRecordsClient({
        baseUrl: settings.config.services.records,
        fetch: settings.fetcher,
        signal,
        timeoutMs,
      });
      try {
        return await records.savePlan(draft);
      } catch (error) {
        if (!(error instanceof ServiceHttpError) || error.status !== 409)
          throw error;
        return records.getPlan(draft.id);
      }
    });
    if (
      saved.id !== draft.id ||
      saved.forecastId !== draft.forecastId ||
      saved.eventId !== draft.eventId ||
      saved.sessionId !== draft.sessionId
    )
      throw new Error("저장된 계획의 예보 범위가 다릅니다");
    deadline.check();
    published.planId = saved.id;
  } catch (error) {
    // 검증 거부 이유는 서버 로그에만 두고 화면에는 재시도 가능한 안내를 보낸다
    const body = error instanceof ServiceHttpError ? error.body : undefined;
    console.warn("계획 초안 저장 실패", {
      status: error instanceof ServiceHttpError ? error.status : null,
      reason:
        body &&
        typeof body === "object" &&
        "message" in body &&
        typeof body.message === "string"
          ? body.message.replace(/[\r\n]/g, " ").slice(0, 1_000)
          : "계획 초안 저장 응답을 확인하지 못했어요",
    });
    deadline.check();
    await writer.emit("error", {
      code: "SERVICE_UNAVAILABLE",
      message: "계획 초안을 저장하지 못했어요",
    });
    return;
  }

  // 계약 R6 예외에 따라 문장·근거·게이트 없이 저장한 초안의 다음 할 일만 보낸다
  const actions = [
    {
      id: "plan-docx",
      label: "계획 초안 docx 받기",
      href: `/api/plans/${published.planId}/export.docx`,
    },
  ];
  await writer.emit("suggest", { actions });
}
