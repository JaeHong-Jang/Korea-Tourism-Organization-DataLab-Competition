// 조건 질문을 숫자 없는 후속 답변과 새 예보·선택 질문으로 나눈다
import type { TeamMessage } from "../analysis/draft-answer.js";
import type { Deadline } from "../lead/deadline.js";
import type { EventWriter } from "../runtime/events.js";
import type { Executor } from "../runtime/executor.js";
import type { TeamSession } from "../runtime/sessions.js";
import type { TeamSettings } from "../runtime/settings.js";
import { resolveChanges } from "./changes.js";
import { whatifFollowup } from "./followup.js";
import { type WhatifKind, whatifMatches } from "./intent.js";
import { newWhatifForecast } from "./new-forecast.js";

// new 모드는 실패·질문에서도 done의 예보 id를 null로 끝내도록 요청에 알린다
export async function runWhatif(
  session: TeamSession,
  message: TeamMessage,
  kind: WhatifKind | undefined,
  execute: Executor,
  writer: EventWriter,
  deadline: Deadline,
  settings: TeamSettings,
  today: string,
  markNew: () => void,
) {
  const published = session.published;
  if (!published) throw new Error("발행 예보가 없습니다");
  const pending = session.pendingWhatif;
  const matches = whatifMatches(message.text);
  kind =
    matches.length === 1
      ? matches[0]
      : matches.length > 1
        ? undefined
        : (kind ?? pending?.kind);
  if (kind === "weather" || kind === "similar") {
    session.pendingWhatif = undefined;
    return whatifFollowup(
      kind,
      { ...session, id: published.report.sessionId },
      execute,
      writer,
      deadline,
      settings,
    );
  }
  markNew();
  const resolved = resolveChanges(
    kind,
    message,
    published.report.event,
    today,
    pending?.forecastId === published.report.forecastId,
  );
  if ("ask" in resolved) {
    session.pendingWhatif = { kind, forecastId: published.report.forecastId };
    await writer.emit("ask", resolved.ask);
    return;
  }
  await newWhatifForecast(
    session,
    resolved.changes,
    resolved.label,
    writer,
    deadline,
    settings,
    today,
  );
}
