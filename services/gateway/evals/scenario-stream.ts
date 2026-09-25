// HTTP 응답을 프레임 도착 시점에 읽고 SSE 봉투 계약을 검사한다
import type { SseEvent } from "@crowdcast/contracts/types";
import { contractRegistry } from "../src/contract/registry.js";
import type { ScenarioTurn } from "./scenario-types.js";

const validateEnvelope = contractRegistry.compile<SseEvent>({
  $ref: "https://crowdcast.local/schemas/sse-event.schema.json",
});

// 오류가 나도 이미 받은 프레임을 보존해 부분 발행을 채점할 수 있게 한다
export async function readScenarioStream(
  fetcher: typeof fetch,
  url: string,
  message: ScenarioTurn["message"],
  timeoutMs = 60_000,
): Promise<ScenarioTurn> {
  const start = performance.now();
  const turn: ScenarioTurn = {
    message,
    events: [],
    elapsedMs: 0,
    problems: [],
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message),
      signal: controller.signal,
    });
    if (
      !response.ok ||
      !response.headers.get("content-type")?.includes("text/event-stream") ||
      !response.body
    )
      throw new Error(`SSE 응답 오류: HTTP ${response.status}`);
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let bytes = 0;
    // 네트워크 청크와 SSE 프레임은 경계가 다르므로 빈 줄까지 모아서 해석한다
    const consume = () => {
      while (true) {
        const boundary = /\r?\n\r?\n/.exec(buffer);
        if (!boundary) break;
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const lines = frame.split(/\r?\n/);
        const values = (name: string) =>
          lines
            .filter((line) => line.startsWith(`${name}:`))
            .map((line) => line.slice(name.length + 1).replace(/^ /, ""));
        const data = values("data");
        if (!data.length) continue;
        const envelope: unknown = JSON.parse(data.join("\n"));
        if (!validateEnvelope(envelope)) throw new Error("SSE 봉투 계약 위반");
        const name = values("event").at(-1);
        const id = values("id").at(-1);
        if (
          name !== envelope.event ||
          (id !== undefined && id !== String(envelope.seq))
        )
          turn.problems.push("SSE event/id와 JSON 봉투 불일치");
        turn.events.push({ elapsedMs: performance.now() - start, envelope });
      }
    };
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 16 * 1024 * 1024) throw new Error("SSE 응답 크기 제한 초과");
      buffer += decoder.decode(value, { stream: true });
      consume();
    }
    buffer += decoder.decode();
    consume();
    if (buffer.trim()) throw new Error("끝나지 않은 SSE 프레임");
  } catch (error) {
    turn.problems.push(
      error instanceof Error ? error.message : "스트림 읽기 실패",
    );
  } finally {
    clearTimeout(timer);
    await reader?.cancel().catch(() => {});
    turn.elapsedMs = performance.now() - start;
  }
  return turn;
}
