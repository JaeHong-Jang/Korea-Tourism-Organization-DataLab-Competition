// 입력이 확정된 행사의 평시·유사 근거를 적재하고 공통 예보관·게이트 A로 넘긴다
import type { Event } from "@crowdcast/contracts/types";
import { archivist } from "../analysis/archivist.js";
import { savedBaseline } from "../reforecast/saved-baseline.js";
import type { EventWriter } from "../runtime/events.js";
import type { Executor } from "../runtime/executor.js";
import type { TeamSettings } from "../runtime/settings.js";
import type { Deadline } from "./deadline.js";
import { forecastEvent } from "./forecast-event.js";
import { knowledgeClient } from "./publish.js";

// 한쪽 분석이 실패하면 다른 호출도 취소하고 종료 기록까지 기다린다
export async function forecastKnownEvent(
  sessionId: string,
  event: Event,
  today: string,
  execute: Executor,
  writer: EventWriter,
  deadline: Deadline,
  settings: TeamSettings,
) {
  await knowledgeClient(settings, deadline).addFacts(sessionId, {
    schema: "event",
    items: [event],
  });
  const pending = [
    execute(savedBaseline, { event, today }, "장소와 평시 근거를 확인해요.", 3),
    execute(archivist, event, "유사 행사의 근거를 찾아요.", 3),
  ] as const;
  for (const operation of pending)
    void operation.catch((error) => deadline.abort(error));
  await Promise.allSettled(pending);
  const [{ baseline }, similar] = await Promise.all(pending);
  return forecastEvent(
    sessionId,
    event,
    { baseline, similar },
    execute,
    writer,
    deadline,
    settings,
    today,
  );
}
