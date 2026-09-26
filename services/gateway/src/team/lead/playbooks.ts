// 새 예보의 받아쓰기·병렬 분석·예보·게이트 A 순서를 지휘한다

import type { Event, EventDraft } from "@crowdcast/contracts/types";
import { RequestTimeoutError } from "../../clients/request-deadline.js";
import { archivist } from "../analysis/archivist.js";
import { dictation } from "../analysis/dictation-step.js";
import type { TeamMessage } from "../analysis/draft-answer.js";
import { localGuide } from "../analysis/local-guide.js";
import type { Agent } from "../runtime/agent.js";
import type { EventWriter } from "../runtime/events.js";
import type { Executor } from "../runtime/executor.js";
import type { TeamSession } from "../runtime/sessions.js";
import type { TeamSettings } from "../runtime/settings.js";
import type { Deadline } from "./deadline.js";
import { forecastEvent } from "./forecast-event.js";
import { ExplanationGateError } from "./gates.js";
import { publishForecast } from "./publish.js";

// 첫 메시지와 되묻기 재개는 LLM 분류 없이 같은 플레이북을 선택한다
const lead: Agent<string, null> = {
  id: "lead",
  team: "lead",
  usesLlm: false,
  budgetMs: 1_000,
  // 분류 호출 없이 새 예보 배정 결과를 작업 기록에 남긴다
  async run(ctx) {
    return { value: null, note: ctx.input };
  },
};

// 행사 적재까지 기다리는 기록관과 지역 분석을 한 실패·취소 범위로 묶는다
async function parallelAnalysis(
  draft: EventDraft,
  session: TeamSession,
  execute: Executor,
  writer: EventWriter,
  deadline: Deadline,
  today: string,
) {
  let ready: (event: Event | null) => void = () => {};
  let rejectReady: (error: unknown) => void = () => {};
  const eventReady = new Promise<Event | null>((resolve, reject) => {
    ready = resolve;
    rejectReady = reject;
  });
  const local = execute(
    localGuide,
    {
      draft,
      today,
      // 행사 적재 성공 후에만 조건을 고정하고 병렬 분석을 시작한다
      ready(event) {
        if (event) session.analyzed = true;
        ready(event);
      },
      // 화면과 메모리에 같은 확정 지역을 기록하되 취소 뒤에는 변경하지 않는다
      async showDraft(value) {
        deadline.check();
        session.draft = value;
        await writer.emit("event_card", value);
      },
    },
    "장소와 평시 근거를 확인해요.",
    3,
  );
  const similar = eventReady.then((event) =>
    event ? execute(archivist, event, "유사 행사의 근거를 찾아요.", 3) : null,
  );
  // 한쪽 실패 시 다른 쪽을 취소하고 두 팀원의 종료 기록까지 기다린다
  void local.catch((error) => {
    rejectReady(error);
    deadline.abort(error);
  });
  void similar.catch((error) => {
    deadline.abort(error);
  });
  const results = await Promise.allSettled([local, similar]);
  for (const result of results)
    if (result.status === "rejected") throw result.reason;
  const location = await local;
  if ("ask" in location) {
    await writer.emit("ask", location.ask);
    session.askedFields = [location.ask.field];
    return null;
  }
  const event = await eventReady;
  if (!event) return null;
  return { event, baseline: location.baseline, similar: (await similar) ?? [] };
}

// 숫자는 분석 게이트 뒤에 보내고 설명은 검증·발행 플레이북으로 이어 간다
export async function newForecast(
  session: TeamSession,
  message: TeamMessage,
  execute: Executor,
  writer: EventWriter,
  deadline: Deadline,
  settings: TeamSettings,
  today: string,
) {
  // 발행 전의 단독 초안 요청은 행사 받아쓰기로 넘기지 않고 먼저 예보를 안내한다
  if (
    !message.answer &&
    /^(?:안전관리\s*)?(?:계획(?:서)?(?:\s*초안)?|초안)(?:을|를)?\s*(?:만들어\s*(?:줘|주세요)|작성해\s*(?:줘|주세요)|부탁해|줘|주세요)?[.!?\s]*$/.test(
      message.text.trim(),
    )
  ) {
    await writer.emit("error", {
      code: "OUT_OF_SCOPE",
      message: "먼저 예보를 받아야 계획 초안을 만들 수 있어요",
    });
    return;
  }
  await execute(
    lead,
    settings.mode === "fake"
      ? "계약 예시 예보로 분석을 시작해요."
      : "새 예보 분석을 시작해요.",
    "새 예보 작업을 배정해요.",
  );
  const extracted = await execute(
    dictation,
    {
      message,
      draft: session.draft,
      askedFields: session.askedFields,
      hazardCandidates: session.hazardCandidates,
      hazardsConfirmed: session.hazardsConfirmed,
    },
    "행사 문장의 필수값을 확인해요.",
    2,
  );
  session.draft = extracted.draft;
  session.hazardCandidates = extracted.hazardCandidates;
  session.hazardsConfirmed = extracted.hazardsConfirmed;
  session.askedFields = [];
  await writer.emit("event_card", extracted.draft);
  if (extracted.questions.length) {
    for (const question of extracted.questions) {
      await writer.emit("ask", question);
      session.askedFields.push(question.field);
    }
    return;
  }

  // 행사 적재 이후의 조건 변경은 새 세션에서만 허용한다
  const analysis = await parallelAnalysis(
    extracted.draft,
    session,
    execute,
    writer,
    deadline,
    today,
  );
  if (!analysis) return;
  const { event, baseline, similar } = analysis;
  const { bundle, gate } = await forecastEvent(
    session.id,
    event,
    { baseline, similar },
    execute,
    writer,
    deadline,
    settings,
    today,
  );
  try {
    await publishForecast(
      session,
      event,
      bundle,
      gate,
      execute,
      writer,
      deadline,
      settings,
    );
  } catch (error) {
    if (error instanceof RequestTimeoutError) throw error;
    throw new ExplanationGateError("설명 문장을 검증하지 못했어요");
  }
}
