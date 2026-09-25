// 목록에서 선택한 행사 입력으로 질문 없이 새 예보를 발행한다
import { randomUUID } from "node:crypto";
import { createForecastClient } from "../../clients/forecast-client.js";
import { ServiceHttpError } from "../../clients/request-json.js";
import { emptyDraft } from "../analysis/normalize/draft.js";
import type { EventWriter } from "../runtime/events.js";
import { createExecutor } from "../runtime/executor.js";
import type { TeamSession } from "../runtime/sessions.js";
import type { TeamSettings } from "../runtime/settings.js";
import type { Deadline } from "./deadline.js";
import { forecastKnownEvent } from "./known-event.js";
import { publishForecast } from "./publish.js";

// 기존 상담의 발행 근거를 덮어쓰지 않도록 선택 예보마다 그래프를 격리한다
export async function selectedEvent(
  session: TeamSession,
  eventId: string,
  writer: EventWriter,
  deadline: Deadline,
  settings: TeamSettings,
  today: string,
) {
  const client = createForecastClient({
    baseUrl: settings.config.services.forecast,
    fetch: settings.fetcher,
    signal: deadline.controller.signal,
    timeoutMs: deadline.budget(5_000, 3),
  });
  const event = await client
    .upcomingEvent(eventId)
    .catch(async (error: unknown) => {
      if (!(error instanceof ServiceHttpError) || error.status !== 404)
        throw error;
      await writer.emit("error", {
        code: "OUT_OF_SCOPE",
        message:
          "목록에서 선택한 행사를 찾을 수 없어요. 행사 목록을 새로 확인해 주세요.",
      });
      return null;
    });
  if (!event) return;
  if (event.id !== eventId) throw new Error("선택 행사 응답 계약 위반");
  const working: TeamSession = {
    ...session,
    id: `s-selected-${randomUUID()}`,
    published: undefined,
    forecastId: undefined,
    completed: false,
    analyzed: true,
    pendingPurpose: undefined,
    pendingWhatif: undefined,
    askedFields: [],
    hazardsConfirmed: true,
  };
  const execute = createExecutor(working.id, settings, deadline, writer);
  const draft = {
    ...emptyDraft(),
    ...Object.fromEntries(
      [
        "name",
        "type",
        "startsAt",
        "endsAt",
        "timeOfDay",
        "sigunguCode",
        "sigunguName",
        "fee",
        "hostType",
        "budgetKrw",
        "promo",
        "hazards",
      ].map((key) => [key, event[key as keyof typeof event]]),
    ),
    venueText: event.venue.name,
    missing: [],
    ambiguities: [],
  };
  await writer.emit("event_card", draft);
  const { bundle, gate } = await forecastKnownEvent(
    working.id,
    event,
    today,
    execute,
    writer,
    deadline,
    settings,
  );
  // 발행 직후 연결·저장이 실패해도 승인된 예보는 상담에서 계속 조회할 수 있다
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
    );
  } finally {
    if (working.published) {
      session.previousForecastIds = [
        ...(session.previousForecastIds ?? []),
        ...(session.forecastId ? [session.forecastId] : []),
      ];
      session.published = working.published;
      session.forecastId = working.forecastId;
      session.completed = true;
      session.analyzed = true;
      session.pendingPurpose = undefined;
      session.pendingWhatif = undefined;
      session.draft = draft;
      session.askedFields = [];
      session.storedEvent = event;
    }
  }
}
