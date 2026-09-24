// 행사 적재 전 실패와 부분 적재 후 동일 내용 재시도의 경계를 검증한다
import { describe, expect, it } from "vitest";
import { teamFixture, validSequence } from "./team-fixture.js";

describe("분석 재시도", () => {
  // 행사 적재 실패는 세션 재시도를 허용하되 묻지 않은 확정값 수정은 반영하지 않는다
  it("행사 적재 실패 뒤 묻지 않은 답을 무시하고 다시 분석한다", async () => {
    let fail = true;
    const harness = teamFixture({
      override: async ({ url, body }) => {
        if (
          fail &&
          url.pathname.endsWith("/facts") &&
          (body as { schema: string }).schema === "event"
        ) {
          fail = false;
          return new Response(null, { status: 503 });
        }
      },
    });
    const id = await harness.prepare();
    const initial = await harness.message(id);
    validSequence(initial);
    expect(initial.at(-2)).toMatchObject({
      event: "error",
      data: { code: "SERVICE_UNAVAILABLE" },
    });
    const retry = await harness.message(id, {
      text: "요금 확인",
      answer: { fee: "유료" },
    });
    validSequence(retry);
    expect(retry.some((event) => event.event === "forecast")).toBe(true);
    const eventLoads = harness.calls.filter(
      (call) =>
        call.url.pathname.endsWith("/facts") &&
        (call.body as { schema: string }).schema === "event",
    );
    expect(eventLoads).toHaveLength(2);
    expect(eventLoads[1].body).toEqual(eventLoads[0].body);
    expect(retry.filter((event) => event.event === "agent_step")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            agentId: "dictation",
            note: "무시한 답 필드: fee",
          }),
        }),
      ]),
    );
  });

  // 기존 행사는 고정하고 같은 근거 재적재는 changesContent에 따라 revision을 유지한다
  it("부분 적재 실패 후 변경 없는 재시도는 행사 revision을 올리지 않는다", async () => {
    let fail = true;
    const harness = teamFixture({
      override: async ({ url, body }) => {
        if (
          fail &&
          url.pathname.endsWith("/facts") &&
          (body as { schema: string }).schema === "forecast"
        ) {
          fail = false;
          return new Response(null, { status: 503 });
        }
      },
    });
    const id = await harness.prepare();
    validSequence(await harness.message(id));
    const changed = await harness.message(id, {
      text: "변경",
      answer: { fee: "유료" },
    });
    expect(changed[0]).toMatchObject({
      event: "error",
      data: { code: "OUT_OF_SCOPE" },
    });
    const retry = await harness.message(id, { text: "같은 행사로 재시도" });
    validSequence(retry);
    expect(retry.find((event) => event.event === "gate")?.data).toMatchObject({
      passed: true,
      revision: 4,
    });
    expect(retry.some((event) => event.event === "forecast")).toBe(true);
    const events = harness.calls.filter(
      (call) =>
        call.url.pathname.endsWith("/facts") &&
        (call.body as { schema: string }).schema === "event",
    );
    expect(events).toHaveLength(2);
    expect(events[0].body).toEqual(events[1].body);
  });
});
