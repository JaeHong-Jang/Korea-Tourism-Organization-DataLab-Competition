// 발행된 상담의 분류 결과를 설명·저장·초안 자리와 범위 안내로 연결한다
import type { EventWriter } from "../runtime/events.js";
import type { Executor } from "../runtime/executor.js";
import type { TeamSession } from "../runtime/sessions.js";
import type { TeamSettings } from "../runtime/settings.js";
import { classify } from "./classify.js";
import type { Deadline } from "./deadline.js";
import { savePublished } from "./followup-save.js";
import { explainWhy } from "./followup-why.js";
import { ExplanationGateError } from "./gates.js";

// T-306은 이 진입점에서 계획서 담당의 검증·발행 플레이북을 연결한다
export async function planDraft(ctx: {
  session: TeamSession;
  execute: Executor;
  writer: EventWriter;
  deadline: Deadline;
  settings: TeamSettings;
}) {
  await ctx.writer.emit("error", {
    code: "OUT_OF_SCOPE",
    message: "계획 초안은 계획서 담당이 곧 맡아요",
  });
}

// 안내만 하는 경로는 발행 전 suggest 대신 계약의 오류 이벤트를 사용한다
export async function followup(
  session: TeamSession,
  text: string,
  execute: Executor,
  writer: EventWriter,
  deadline: Deadline,
  settings: TeamSettings,
) {
  const intent = await classify(text, execute, deadline);
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
  const message =
    intent === "whatif"
      ? "비·요일을 바꿔 보는 기능은 준비 중이에요"
      : intent === "new_event"
        ? "새 예보는 새 상담에서 시작해 주세요."
        : "예보의 이유·근거 설명, 예보서 저장, 계획 초안 요청을 도와드릴 수 있어요.";
  await writer.emit("error", { code: "OUT_OF_SCOPE", message });
}
