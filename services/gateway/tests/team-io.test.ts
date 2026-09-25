// trace와 SSE 지연이 요청 종료·세션 잠금 해제를 막지 않는지 검증한다
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { shortText, teamFixture, validSequence } from "./team-fixture.js";

afterEach(() => vi.restoreAllMocks());

describe("기록·전송 마감", () => {
  // 취소를 무시하는 파일 쓰기도 바깥 마감으로 격리한다
  it("trace가 멈춰도 마감 오류·done 뒤 세션 잠금이 풀린다", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    let traceSignal: AbortSignal | undefined;
    const harness = teamFixture({
      deadlineMs: 120,
      traceAppend: async (_path, _line, signal) => {
        traceSignal = signal;
        await new Promise(() => {});
      },
    });
    const id = await harness.create();
    const events = await harness.message(id, { text: shortText });
    validSequence(events);
    expect(events.slice(-2)).toMatchObject([
      { event: "error", data: { code: "DEADLINE_EXCEEDED" } },
      { event: "done" },
    ]);
    expect(traceSignal?.aborted).toBe(true);
    expect(warning).toHaveBeenCalledTimes(1);
    validSequence(await harness.message(id, { text: shortText }));
  });

  // 디스크 오류는 분석·메모리 작업 기록·done 전송을 실패로 바꾸지 않는다
  it("trace 쓰기 실패는 로그만 남기고 분석을 완료한다", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const harness = teamFixture({
      traceAppend: async () => {
        throw new Error("디스크 쓰기 실패");
      },
    });
    const id = await harness.prepare();
    warning.mockClear();
    const events = await harness.message(id);
    validSequence(events);
    expect(events.some((event) => event.event === "forecast")).toBe(true);
    expect(warning).toHaveBeenCalledTimes(1);
    const steps = await (
      await harness.app.request(`/api/team/sessions/${id}/steps`)
    ).json();
    expect(steps).toHaveLength(17);
  });

  // 응답을 읽지 않는 연결의 역압력도 마감에 끊고 새 요청을 허용한다
  it("SSE 소비가 멈추면 마감 후 세션을 다시 사용할 수 있다", async () => {
    const harness = teamFixture({ deadlineMs: 120 });
    const id = await harness.create();
    const response = await harness.app.request(
      `/api/team/sessions/${id}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ text: shortText }),
      },
    );
    await delay(400);
    validSequence(await harness.message(id, { text: shortText }));
    await response.body?.cancel();
  });
});
