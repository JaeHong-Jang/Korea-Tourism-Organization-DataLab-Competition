// 조건 질문을 숫자 없는 후속 답변과 새 예보·선택 질문으로 나눈다
import { isDeepStrictEqual } from "node:util";
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
  // 바꿀 조건이 이미 지금 예보와 같으면 같은 예보가 나오므로 새로 만들지 않고 알린다(W03 — 예보 id가 같아 서비스 오류로 끝나던 문제)
  const current = published.report.event as unknown as Record<string, unknown>;
  const unchanged = Object.entries(resolved.changes).every(([key, value]) =>
    isDeepStrictEqual(current[key], value),
  );
  if (unchanged) {
    session.pendingWhatif = undefined;
    await writer.emit("error", {
      code: "OUT_OF_SCOPE",
      message: `이미 ${resolved.label} 조건으로 만든 예보예요 — 바꿀 것이 없어 지금 예보와 같아요. 요일·시간대·요금 중 다른 조건을 물어봐 주세요.`,
    });
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
