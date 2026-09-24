// POST 상담 응답의 SSE 프레임을 계약과 순서 규칙으로 확인한다.
import type { SseEvent } from "@crowdcast/contracts/types";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
// @ts-expect-error 공용 계약 규칙은 JavaScript 모듈로 배포된다.
import { sequenceProblems } from "../../../../../packages/contracts/rules/sse-sequence.mjs";

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const schemas = import.meta.glob(
  "../../../../../packages/contracts/schemas/*.schema.json",
  { eager: true, import: "default" },
);
for (const schema of Object.values(schemas)) ajv.addSchema(schema as object);
const validate = ajv.getSchema(
  "https://crowdcast.local/schemas/sse-event.schema.json",
);

// 전송 청크가 프레임이나 UTF-8 글자 사이에서 끊겨도 완성된 프레임만 꺼낸다.
export function createSseParser(onEvent: (event: SseEvent) => void) {
  let pending = "";
  // 프레임 이름과 JSON 본문을 함께 검증한 뒤 화면 콜백에 넘긴다.
  const consume = (frame: string) => {
    const lines = frame.split("\n");
    const name = lines
      .find((line) => line.startsWith("event:"))
      ?.slice(6)
      .trim();
    const data = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) return;
    if (!name) throw new Error("SSE 이벤트 이름이 없어요.");
    let event: unknown;
    try {
      event = JSON.parse(data);
    } catch {
      throw new Error("SSE JSON을 읽지 못했어요.");
    }
    if (!validate?.(event) || (name && (event as SseEvent).event !== name))
      throw new Error(`SSE 계약 위반: ${ajv.errorsText(validate?.errors)}`);
    onEvent(event as SseEvent);
  };
  return {
    // 완료된 프레임만 소비하고 나머지 조각은 다음 청크까지 보관한다.
    push(chunk: string) {
      pending += chunk;
      pending = pending.replaceAll("\r\n", "\n");
      let end = pending.indexOf("\n\n");
      while (end >= 0) {
        consume(pending.slice(0, end));
        pending = pending.slice(end + 2);
        end = pending.indexOf("\n\n");
      }
    },
    // 연결 종료 시 미완성 프레임이 남으면 정상 완료로 취급하지 않는다.
    finish() {
      if (pending.trim()) throw new Error("SSE 프레임이 중간에 끊겼어요.");
    },
  };
}

// 각 이벤트를 받은 즉시 순서를 검사하고 종료 프레임 누락도 끝에서 확인한다.
export function checkSequence(events: SseEvent[], finished = false): string[] {
  const problems = sequenceProblems(events, { mode: "new" }) as string[];
  return finished || events.at(-1)?.event === "done"
    ? problems
    : problems.filter(
        (problem) =>
          problem !== "done으로 끝나지 않는다" &&
          !problem.startsWith("게이트 A 실패인데") &&
          !problem.startsWith("문장이 가리킨 근거"),
      );
}

// POST 스트림을 중단 신호와 함께 읽어 검증된 이벤트만 화면에 넘긴다.
export async function postTeamMessage(
  sessionId: string,
  body: { text: string; answer?: object },
  signal: AbortSignal,
  onEvent: (event: SseEvent) => void,
) {
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
  const events: SseEvent[] = [];
  const parser = createSseParser((event) => {
    events.push(event);
    const problems = checkSequence(events);
    if (problems.length)
      throw new Error(`SSE 순서 위반: ${problems.join("; ")}`);
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
    const problems = checkSequence(events, true);
    if (problems.length)
      throw new Error(`SSE 순서 위반: ${problems.join("; ")}`);
  } catch (cause) {
    // 계약·순서 오류가 나면 남은 네트워크 응답을 즉시 취소한다.
    await reader.cancel().catch(() => {});
    throw cause;
  } finally {
    reader.releaseLock();
  }
}
