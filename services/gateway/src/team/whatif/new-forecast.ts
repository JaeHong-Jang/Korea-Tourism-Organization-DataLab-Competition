// 변경 조건을 격리된 근거 묶음에서 검증하고 발행에 성공한 예보만 상담에 연결한다
import { randomUUID } from "node:crypto";
import { responseSchema } from "../../contract/responses.js";
import { archivist } from "../analysis/archivist.js";
import type { Deadline } from "../lead/deadline.js";
import { forecastEvent } from "../lead/forecast-event.js";
import { knowledgeClient, publishForecast } from "../lead/publish.js";
import type { EventWriter } from "../runtime/events.js";
import { createExecutor } from "../runtime/executor.js";
import type { TeamSession } from "../runtime/sessions.js";
import type { TeamSettings } from "../runtime/settings.js";
import type { WhatifChanges } from "./changes.js";
import { whatifForecaster } from "./forecast.js";

// 기존 예보서·행사 원문은 보존하고 새 수치는 결정적 서비스에서만 받는다
export async function newWhatifForecast(
  session: TeamSession,
  changes: WhatifChanges,
  label: string,
  writer: EventWriter,
  deadline: Deadline,
  settings: TeamSettings,
  today: string,
) {
  const original = session.published?.report;
  if (!original) throw new Error("발행 예보가 없습니다");
  const event = { ...structuredClone(original.event), ...changes };
  if (
    !responseSchema("event")(event) ||
    Date.parse(event.endsAt) <= Date.parse(event.startsAt)
  )
    throw new Error("변경 행사 계약 위반");
  const working: TeamSession = {
    ...session,
    id: `s-whatif-${randomUUID()}`,
    published: undefined,
    forecastId: undefined,
    completed: false,
    pendingWhatif: undefined,
  };
  const execute = createExecutor(working.id, settings, deadline, writer);
  await knowledgeClient(settings, deadline).addFacts(working.id, {
    schema: "event",
    items: [event],
  });
  const similar = await execute(
    archivist,
    event,
    "바뀐 조건의 유사 행사 근거를 찾아요.",
    3,
  );
  const { bundle, gate } = await forecastEvent(
    working.id,
    event,
    { baseline: null, similar, conditionLabel: label },
    execute,
    writer,
    deadline,
    settings,
    today,
    whatifForecaster(
      original.event,
      changes,
      [original.forecastId, ...(session.previousForecastIds ?? [])],
      settings,
    ),
  );

  // 발행 뒤 전송·저장이 실패해도 이미 승인된 예보의 식별자는 되돌리지 않는다
  try {
    await publishForecast(
      working,
      event,
      bundle,
      gate,
      execute,
      writer,
      deadline,
      settings,
      false,
    );
  } finally {
    if (working.published) {
      session.previousForecastIds = [
        ...(session.previousForecastIds ?? []),
        original.forecastId,
      ];
      session.storedEvent ??= original.event;
      session.published = working.published;
      session.forecastId = working.forecastId;
      session.completed = true;
      session.pendingWhatif = undefined;
    }
  }
}
