// 발행 뒤 상담 요청에서 새 예보와 설명 후속 스트림을 모두 검증한다.
import type { SseEvent } from "@crowdcast/contracts/types";
// @ts-expect-error 공용 SSE 순서 규칙은 JavaScript 모듈로 배포된다.
import { sequenceProblems } from "../../../../../packages/contracts/rules/sse-sequence.mjs";
import { createSseParser } from "../../lib/team-stream/stream";
import type { Message } from "./use-consult-session";

// 후속 스트림이 끝나기 전까지는 완료 시점에만 판정할 수 있는 위반을 미룬다.
function currentProblems(
  events: SseEvent[],
  mode: "new" | "followup" | "recommend",
  forecastId: string | null,
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

// 예보·후속 설명·방문객 추천 중 계약을 만족하는 스트림만 전달한다.
export async function postConsultMessage(
  sessionId: string,
  body: Message,
  signal: AbortSignal,
  forecastId: string | null,
  onEvent: (event: SseEvent) => void,
) {
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

  // 추천과 예보의 첫 상태 프레임은 같으므로 가능한 순서 중 하나가 남아 있으면 표시한다.
  const events: SseEvent[] = [];
  const parser = createSseParser((event) => {
    events.push(event);
    const modes: ("new" | "followup" | "recommend")[] = forecastId
      ? ["new", "followup", "recommend"]
      : ["new", "recommend"];
    if (modes.every((mode) => currentProblems(events, mode, forecastId).length))
      throw new Error(
        `SSE 순서 위반: ${currentProblems(events, "new", forecastId).join("; ")}`,
      );
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
    const modes: ("new" | "followup" | "recommend")[] = forecastId
      ? ["new", "followup", "recommend"]
      : ["new", "recommend"];
    if (modes.every((mode) => currentProblems(events, mode, forecastId).length))
      throw new Error("SSE 순서 위반: 완료 이벤트가 없어요.");
  } catch (cause) {
    await reader.cancel().catch(() => {});
    throw cause;
  } finally {
    reader.releaseLock();
  }
}
