// 발행된 상담의 분류 결과를 설명·저장·계획 초안과 범위 안내로 연결한다

import type { TeamMessage } from "../analysis/draft-answer.js";
import type { EventWriter } from "../runtime/events.js";
import type { Executor } from "../runtime/executor.js";
import type { TeamSession } from "../runtime/sessions.js";
import type { TeamSettings } from "../runtime/settings.js";
import { runWhatif } from "../whatif/run.js";
import { classify, ruleIntents } from "./classify.js";
import type { Deadline } from "./deadline.js";
import { draftPublishedPlan } from "./followup-plan.js";
import { savePublished } from "./followup-save.js";
import { explainWhy } from "./followup-why.js";
import { ExplanationGateError } from "./gates.js";

// 계획서 담당은 최초 스냅샷의 발행 문장을 재사용해 초안 저장으로 연결한다
export async function planDraft(ctx: {
  session: TeamSession;
  execute: Executor;
  writer: EventWriter;
  deadline: Deadline;
  settings: TeamSettings;
}) {
  return draftPublishedPlan(ctx);
}

// 안내만 하는 경로는 발행 전 suggest 대신 계약의 오류 이벤트를 사용한다
export async function followup(
  session: TeamSession,
  message: TeamMessage,
  execute: Executor,
  writer: EventWriter,
  deadline: Deadline,
  settings: TeamSettings,
  today: string,
  markNew: () => void,
) {
  const known = ruleIntents(message.text);
  if (known.length && !known.includes("whatif"))
    session.pendingWhatif = undefined;
  const classified = session.pendingWhatif
    ? { intent: "whatif" as const, whatifKind: session.pendingWhatif.kind }
    : await classify(message.text, execute, deadline);
  const { intent } = classified;
  if (intent === "whatif")
    return runWhatif(
      session,
      message,
      classified.whatifKind,
      execute,
      writer,
      deadline,
      settings,
      today,
      markNew,
    );
  // 상담 식별자는 유지하되 후속 검증은 현재 발행본의 근거 그래프에서 이어 간다
  session = {
    ...session,
    id: session.published?.report.sessionId ?? session.id,
  };
  if (intent === "why") {
    try {
      await explainWhy(session, execute, writer, deadline, settings);
    } catch {
      throw new ExplanationGateError("설명 문장을 검증하지 못했어요");
    }
    return;
  }
  if (intent === "save")
    return savePublished(session, execute, deadline, settings);
  if (intent === "draft")
    return planDraft({ session, execute, writer, deadline, settings });
  const notice =
    intent === "new_event"
      ? "새 예보는 새 상담에서 시작해 주세요."
      : "예보의 이유·근거 설명, 예보서 저장, 계획 초안 요청을 도와드릴 수 있어요.";
  await writer.emit("error", { code: "OUT_OF_SCOPE", message: notice });
}
