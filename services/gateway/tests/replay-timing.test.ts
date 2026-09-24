// 가짜 시계로 재생 간격과 연결 종료 뒤 타이머·이벤트가 남지 않는지 검사한다
import type { SseEvent } from "@crowdcast/contracts/types";
import { describe, expect, it, vi } from "vitest";
import { playTrace } from "../src/team/replay/play-trace.js";
import { waitForReplay } from "../src/team/replay/timing.js";
import { validateTrace } from "../src/team/replay/validate-trace.js";
import {
  at,
  contractEvents,
  replayFixture,
  traceText,
} from "./replay-fixture.js";
import { parseEvents } from "./team-fixture.js";

describe("원래 이벤트 간격", () => {
  // 요청 시작 전 공백 없이 첫 이벤트를 보내고 인접 시각 차이만 기다린다
  it.each([
    [
      [at(0), at(120), at(480)],
      [120, 360],
    ],
    [[at(0), at(20_000)], [8_000]],
    [[at(480), at(120)], [0]],
    [
      [undefined, undefined, undefined],
      [300, 300],
    ],
    [
      [at(0), undefined, at(480)],
      [300, 300],
    ],
  ])("시각 %j의 대기는 %j이다", async (times, gaps) => {
    const envelopes = contractEvents().slice(0, times.length);
    const wait = vi.fn(async () => {});
    const write = vi.fn(async () => {});
    await playTrace(
      envelopes.map((envelope, i) => ({ envelope, at: times[i] })),
      write,
      new AbortController().signal,
      wait,
    );
    expect(wait.mock.calls.map((call) => (call as unknown[])[0])).toEqual(gaps);
    expect(write.mock.calls.map((call) => (call as unknown[])[0])).toEqual(
      envelopes,
    );
  });

  // 실제 타이머 구현은 가짜 시간의 경계 전에 다음 이벤트를 내보내지 않는다
  it("120ms와 360ms 경계를 지나서만 전송한다", async () => {
    vi.useFakeTimers();
    const sent: SseEvent[] = [];
    const events = contractEvents()
      .slice(0, 3)
      .map((envelope, i) => ({ envelope, at: at([0, 120, 480][i]) }));
    const replay = playTrace(
      events,
      async (event) => {
        sent.push(event);
      },
      new AbortController().signal,
    );
    await vi.advanceTimersByTimeAsync(119);
    expect(sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(359);
    expect(sent).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    await replay;
    expect(sent).toHaveLength(3);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("연결 종료", () => {
  // 첫 프레임 다음 대기 중 취소하면 즉시 타이머를 지우고 이후 전송은 없다
  it("대기 중 취소는 남은 이벤트와 타이머를 없앤다", async () => {
    vi.useFakeTimers();
    const sent: SseEvent[] = [];
    const disconnected = new AbortController();
    const replay = playTrace(
      validateTrace(traceText(contractEvents())),
      async (event) => {
        sent.push(event);
      },
      disconnected.signal,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1);
    disconnected.abort();
    await replay;
    expect(vi.getTimerCount()).toBe(0);
    await vi.runAllTimersAsync();
    expect(sent).toHaveLength(1);
  });

  // 이미 닫힌 요청은 첫 프레임도 보내지 않고 대기 타이머를 만들지 않는다
  it("이미 취소된 요청은 전송·대기하지 않는다", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    controller.abort();
    const write = vi.fn(async () => {});
    await playTrace(
      validateTrace(traceText(contractEvents())),
      write,
      controller.signal,
    );
    await expect(waitForReplay(300, controller.signal)).rejects.toBe(
      controller.signal.reason,
    );
    expect(write).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  // HTTP 중단과 응답 소비 취소를 모두 실제 Hono SSE에 연결한다
  it.each(["reader", "request"])(
    "%s 취소가 실제 라우트 대기를 해제한다",
    async (source) => {
      vi.useFakeTimers();
      let waiting: () => void = () => {};
      const started = new Promise<void>((resolve) => {
        waiting = resolve;
      });
      const wait = vi.fn((ms: number, signal: AbortSignal) => {
        const pending = waitForReplay(ms, signal);
        waiting();
        return pending;
      });
      const harness = replayFixture(wait);
      harness.save(traceText(contractEvents()));
      const controller = new AbortController();
      const response = await harness.request(undefined, controller.signal);
      const reader = response.body?.getReader();
      if (!reader) throw new Error("응답 스트림이 필요합니다");
      const first = await reader.read();
      expect(parseEvents(new TextDecoder().decode(first.value))).toHaveLength(
        1,
      );
      await started;
      expect(vi.getTimerCount()).toBe(1);
      if (source === "reader") await reader.cancel();
      else controller.abort();
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(0);
      expect(wait).toHaveBeenCalledTimes(1);
      expect((await reader.read()).done).toBe(true);
    },
  );
});
