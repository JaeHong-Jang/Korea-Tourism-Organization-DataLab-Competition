// 잘린 UTF-8·SSE 프레임과 오류 응답이 평가 결과에 보존되는지 확인한다
import { describe, expect, it } from "vitest";
import { readScenarioStream } from "../evals/scenario-stream.js";

const ask = {
  event: "ask",
  seq: 0,
  data: {
    field: "hostType",
    question: "주최 유형을 확인해 주세요.",
    options: [],
  },
};
const done = {
  event: "done",
  seq: 1,
  data: { sessionId: "s-scenario-test", forecastId: null },
};

// 하나의 UTF-8 글자도 여러 청크에 걸쳐 오도록 응답을 작은 단위로 쪼갠다
function chunked(text: string): typeof fetch {
  const bytes = new TextEncoder().encode(text);
  let cursor = 0;
  return async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          if (cursor >= bytes.length) {
            controller.close();
            return;
          }
          controller.enqueue(bytes.slice(cursor, cursor + 2));
          cursor += 2;
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    );
}

describe("평가 SSE 수집", () => {
  it("CRLF·한글·주석·청크 경계를 복원하며 각 프레임 도착 시각을 남긴다", async () => {
    const text = `: keep-alive\r\n\r\nevent: ask\r\nid: 0\r\ndata: ${JSON.stringify(ask)}\r\n\r\nevent: done\r\nid: 1\r\ndata: ${JSON.stringify(done)}\r\n\r\n`;
    const turn = await readScenarioStream(chunked(text), "http://127.0.0.1", {
      text: "행사 상담",
    });
    expect(turn.problems).toEqual([]);
    expect(turn.events.map((item) => item.envelope)).toEqual([ask, done]);
    expect(turn.events[0].elapsedMs).toBeLessThan(turn.events[1].elapsedMs);
    expect(turn.events[1].elapsedMs).toBeLessThanOrEqual(turn.elapsedMs);
  });

  it("봉투와 event/id가 다르면 오류로 기록한다", async () => {
    const turn = await readScenarioStream(
      chunked(`event: done\nid: 9\ndata: ${JSON.stringify(ask)}\n\n`),
      "http://127.0.0.1",
      { text: "행사 상담" },
    );
    expect(turn.problems.join()).toContain("불일치");
  });

  it.each(["data: {bad}\n\n", 'data: {"event":"claim"}\n\n', "data: {}"])(
    "잘못된 JSON·계약·중단 프레임을 거부한다",
    async (text) => {
      const turn = await readScenarioStream(chunked(text), "http://127.0.0.1", {
        text: "행사 상담",
      });
      expect(turn.problems.length).toBeGreaterThan(0);
    },
  );

  it("실패 직전까지 받은 이벤트를 지우지 않는다", async () => {
    const turn = await readScenarioStream(
      chunked(`event: ask\ndata: ${JSON.stringify(ask)}\n\ndata: {bad}\n\n`),
      "http://127.0.0.1",
      { text: "행사 상담" },
    );
    expect(turn.events).toHaveLength(1);
    expect(turn.problems).toHaveLength(1);
  });

  it("HTTP 실패·마감을 요청 실패로 남긴다", async () => {
    const error = await readScenarioStream(
      async () => new Response(null, { status: 503 }),
      "http://127.0.0.1",
      { text: "행사 상담" },
    );
    expect(error.problems.join()).toContain("503");
    const hanging: typeof fetch = async (_, init) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new Error("마감")),
          { once: true },
        );
      });
    const timed = await readScenarioStream(
      hanging,
      "http://127.0.0.1",
      { text: "행사 상담" },
      5,
    );
    expect(timed.problems).toEqual(["마감"]);
  });
});
