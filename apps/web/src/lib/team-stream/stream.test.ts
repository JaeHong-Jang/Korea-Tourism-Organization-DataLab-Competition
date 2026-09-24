// 계약 픽스처로 청크 파싱과 이벤트·순서 위반의 화면 전달 차단을 확인한다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SseEvent } from "@crowdcast/contracts/types";
import { afterEach, expect, it, vi } from "vitest";
import { checkSequence, createSseParser, postTeamMessage } from "./stream";

const fixture = (name: string): SseEvent[] =>
  JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "../../packages/contracts/fixtures-sse",
        `${name}.json`,
      ),
      "utf8",
    ),
  );
const frames = (events: SseEvent[]) =>
  events
    .map((event) => `event: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("");
afterEach(() => vi.unstubAllGlobals());

// UTF-8과 프레임 경계 어디서 끊겨도 원래 이벤트를 복원한다.
it("청크 경계에서 이벤트를 복원한다", () => {
  const events = fixture("valid-new-forecast");
  const received: SseEvent[] = [];
  const parser = createSseParser((event) => received.push(event));
  const body = frames(events);
  for (let at = 0; at < body.length; at += 3)
    parser.push(body.slice(at, at + 3));
  parser.finish();
  expect(received).toEqual(events);
});

// CRLF 구분자도 청크 사이에서 끊겨도 정확하게 복원한다.
it("CRLF 청크 경계를 복원한다", () => {
  const received: SseEvent[] = [];
  const parser = createSseParser((event) => received.push(event));
  const body = frames(fixture("valid-gate-a-failed")).replaceAll("\n", "\r\n");
  for (let at = 0; at < body.length; at += 1)
    parser.push(body.slice(at, at + 1));
  parser.finish();
  expect(received).toEqual(fixture("valid-gate-a-failed"));
});

// 계약 오류 이벤트를 받은 뒤에는 다음 화면 갱신을 하지 않는다.
it("계약 위반 이벤트를 거부한다", () => {
  const parser = createSseParser(() => {});
  expect(() =>
    parser.push(
      'event: forecast\ndata: {"event":"forecast","seq":0,"data":{"id":"f-bad"}}\n\n',
    ),
  ).toThrow(/계약 위반/);
});

// 공용 규칙의 대표 위반 세 가지가 모두 오류 카드의 원인이 된다.
it.each([
  "invalid-forecast-before-gate-a",
  "invalid-forecast-after-failed-gate",
  "invalid-ask-after-gate-a",
  "invalid-gate-a-twice",
])("%s 순서 위반을 알린다", (name) => {
  expect(checkSequence(fixture(name), true).length).toBeGreaterThan(0);
});

// 잘못된 스트림은 정상 수치 이벤트를 화면 콜백으로 넘기기 전에 중단한다.
it("순서가 틀린 POST 스트림을 중단한다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(frames(fixture("invalid-forecast-before-gate-a")), {
          headers: { "Content-Type": "text/event-stream" },
        }),
    ),
  );
  const onEvent = vi.fn();
  await expect(
    postTeamMessage(
      "s-demo",
      { text: "영종 씨사이드파크 불꽃축제" },
      new AbortController().signal,
      onEvent,
    ),
  ).rejects.toThrow(/순서 위반/);
  expect(onEvent.mock.calls.some(([event]) => event.event === "forecast")).toBe(
    false,
  );
});
