// 발행 뒤 상담 요청에서 새 예보와 설명 후속 스트림을 모두 검증한다.
import type { SseEvent } from "@crowdcast/contracts/types";
// @ts-expect-error 공용 SSE 순서 규칙은 JavaScript 모듈로 배포된다.
import { sequenceProblems } from "../../../../../packages/contracts/rules/sse-sequence.mjs";
import { createSseParser, postTeamMessage } from "../../lib/team-stream/stream";
import type { Message } from "./use-consult-session";

// 후속 스트림이 끝나기 전까지는 완료 시점에만 판정할 수 있는 위반을 미룬다.
function currentProblems(
  events: SseEvent[],
  mode: "new" | "followup",
  forecastId: string,
) {
  const problems = sequenceProblems(events, { mode, forecastId }) as string[];
  return events.at(-1)?.event === "done"
    ? problems
    : problems.filter(
        (problem) =>
          problem !== "done으로 끝나지 않는다" &&
          !problem.startsWith("게이트 A 실패인데") &&
          !problem.startsWith("문장이 가리킨 근거"),
      );
}

// 첫 예보는 기존 전송기를 쓰고, 발행 뒤에는 두 플레이북 중 유효한 흐름을 받는다.
export async function postConsultMessage(
  sessionId: string,
  body: Message,
  signal: AbortSignal,
  forecastId: string | null,
  onEvent: (event: SseEvent) => void,
) {
  if (!forecastId) return postTeamMessage(sessionId, body, signal, onEvent);

  // 계약 스키마 검사는 공용 파서에 맡기고 메시지별 순서를 따로 검사한다.
  const response = await fetch(
    `/api/team/sessions/${encodeURIComponent(sessionId)}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body),
      signal,
    },
  );
  if (
    !response.ok ||
    !response.body ||
    !response.headers.get("content-type")?.includes("text/event-stream")
  )
    throw new Error(`상담 연결 실패: ${response.status}`);

  // 두 모드가 모두 거부할 때만 화면 반영을 막아 초기 팀원 상태를 즉시 보여 준다.
  const events: SseEvent[] = [];
  const parser = createSseParser((event) => {
    events.push(event);
    const newProblems = currentProblems(events, "new", forecastId);
    const followupProblems = currentProblems(events, "followup", forecastId);
    if (newProblems.length && followupProblems.length)
      throw new Error(`SSE 순서 위반: ${newProblems.join("; ")}`);
    onEvent(event);
  });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.finish();
    if (
      currentProblems(events, "new", forecastId).length &&
      currentProblems(events, "followup", forecastId).length
    )
      throw new Error("SSE 순서 위반: 완료 이벤트가 없어요.");
  } catch (cause) {
    await reader.cancel().catch(() => {});
    throw cause;
  } finally {
    reader.releaseLock();
  }
}
