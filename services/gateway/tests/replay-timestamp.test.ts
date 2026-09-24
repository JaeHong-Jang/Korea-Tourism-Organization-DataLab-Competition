// trace 시각은 큐 예약이나 파일 쓰기 시각이 아닌 실제 전송 직전 시각인지 확인한다
import { describe, expect, it, vi } from "vitest";
import { readConfig } from "../src/config.js";
import { Deadline } from "../src/team/lead/deadline.js";
import { createEventWriter } from "../src/team/runtime/events.js";
import { createSessionStore } from "../src/team/runtime/sessions.js";
import { teamSettings } from "../src/team/runtime/settings.js";
import { at } from "./replay-fixture.js";

describe("trace 전송 시각", () => {
  // 첫 write와 trace 기록이 밀려도 다음 at은 다음 write가 시작할 때 찍는다
  it("직렬 큐의 이벤트를 보내기 직전 UTC 밀리초를 기록한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(at(0));
    const rows: { at: string; event: string; seq: number; data: unknown }[] =
      [];
    const settings = teamSettings(readConfig({}), fetch, {
      env: {},
      traceAppend: async (_path, line) => {
        rows.push(JSON.parse(line));
        vi.setSystemTime(at(480));
      },
    });
    const session = createSessionStore().create();
    const deadline = new Deadline(20_000);
    const sentAt: string[] = [];
    const writer = createEventWriter(
      session,
      settings,
      "영종-시각-검증",
      async (event) => {
        expect(Object.keys(event).sort()).toEqual(["data", "event", "seq"]);
        sentAt.push(new Date().toISOString());
        vi.setSystemTime(at(120));
      },
      deadline,
      new AbortController().signal,
    );
    try {
      await Promise.all([
        writer.emit("error", {
          code: "SERVICE_UNAVAILABLE",
          message: "연결 확인",
        }),
        writer.emit("done", { sessionId: session.id, forecastId: null }),
      ]);
      expect(rows.map((row) => row.at)).toEqual([at(0), at(480)]);
      expect(rows.map((row) => row.at)).toEqual(sentAt);
    } finally {
      deadline.dispose();
    }
    expect(vi.getTimerCount()).toBe(0);
  });
});
