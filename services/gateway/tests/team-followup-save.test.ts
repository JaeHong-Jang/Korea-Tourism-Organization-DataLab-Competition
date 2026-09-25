// 저장 확인과 최초 발행 스냅샷 재시도의 쓰기 횟수·마감을 검증한다
import { expect, it, vi } from "vitest";
import { followupFixture, validFollowup } from "./followup-fixture.js";
import { teamFixture, validSequence } from "./team-fixture.js";

// 스냅샷이 있으면 조회만 하고 동일 세션의 기존 예보 id로 종료한다
it("저장된 스냅샷은 records 쓰기 없이 저장 완료를 안내한다", async () => {
  const harness = followupFixture();
  const { id, forecastId, report } = await harness.publish();
  const before = harness.calls.length;
  const events = await harness.message(id, { text: "저장해 줘" });
  validFollowup(events, forecastId);
  expect(harness.calls.slice(before).map((call) => call.url.pathname)).toEqual([
    `/v1/snapshots/${forecastId}`,
  ]);
  expect(
    events.filter((event) => event.event === "agent_step").at(-1)?.data,
  ).toMatchObject({ agentId: "lead", note: "예보서를 저장했어요" });
  expect(harness.snapshots.get(forecastId)).toEqual(report);
});

// 행사만 저장된 뒤 중복 id가 409인 records에서도 최초 보고서만 다시 저장한다
it("행사 저장 뒤 스냅샷이 실패하면 기존 행사를 재사용한다", async () => {
  let unavailable = true;
  const harness = followupFixture({
    override: async ({ url }) =>
      unavailable && url.pathname.endsWith("/snapshots")
        ? new Response(null, { status: 503 })
        : undefined,
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const { id, forecastId, report } = await harness.publish();
  expect(harness.snapshots.size).toBe(0);
  expect(harness.storedEvents.get(report.event.id)).toEqual(report.event);
  unavailable = false;
  validFollowup(await harness.message(id, { text: "왜?" }), forecastId);
  const before = harness.calls.length;
  const events = await harness.message(id, { text: "저장해 줘" });
  validFollowup(events, forecastId);
  const calls = harness.calls.slice(before);
  expect(calls.map((call) => call.url.pathname)).toEqual([
    `/v1/snapshots/${forecastId}`,
    `/v1/events/${report.event.id}`,
    `/v1/events/${report.event.id}/snapshots`,
  ]);
  expect(calls.filter((call) => call.body)).toHaveLength(1);
  expect(calls.at(-1)?.body).toEqual(report);
  expect(JSON.stringify(events)).toContain("예보서를 저장했어요");
  expect(harness.snapshots.get(forecastId)).toEqual(report);
});

// 행사와 스냅샷이 모두 없으면 행사 없음 응답 뒤에만 각각 한 번 저장한다
it("저장된 행사가 없으면 행사와 스냅샷을 한 번씩 저장한다", async () => {
  const harness = followupFixture();
  const { id, forecastId, report } = await harness.publish();
  harness.storedEvents.clear();
  harness.snapshots.clear();
  const before = harness.calls.length;
  const events = await harness.message(id, { text: "저장해 줘" });
  validFollowup(events, forecastId);
  const calls = harness.calls.slice(before);
  expect(calls.map((call) => call.url.pathname)).toEqual([
    `/v1/snapshots/${forecastId}`,
    `/v1/events/${report.event.id}`,
    "/v1/events",
    `/v1/events/${report.event.id}/snapshots`,
  ]);
  expect(calls.filter((call) => call.body).map((call) => call.body)).toEqual([
    report.event,
    report,
  ]);
  expect(harness.storedEvents.get(report.event.id)).toEqual(report.event);
  expect(harness.snapshots.get(forecastId)).toEqual(report);
  expect(JSON.stringify(events)).toContain("예보서를 저장했어요");
});

// 같은 id의 다른 행사나 조회 장애를 미저장으로 취급하면 안 된다
it.each(["different-event", "unavailable"])(
  "행사 조회가 %s이면 추가 쓰기 없이 저장 실패를 안내한다",
  async (mode) => {
    let retry = false;
    const harness = followupFixture({
      override: async ({ url }) =>
        retry &&
        mode === "unavailable" &&
        /^\/v1\/events\/[^/]+$/.test(url.pathname)
          ? new Response(null, { status: 503 })
          : undefined,
    });
    const { id, forecastId, report } = await harness.publish();
    harness.snapshots.clear();
    if (mode === "different-event")
      harness.storedEvents.set(report.event.id, {
        ...report.event,
        startsAt: "2026-10-19T19:00:00+09:00",
        endsAt: "2026-10-19T21:00:00+09:00",
      });
    retry = true;
    const before = harness.calls.length;
    const events = await harness.message(id, { text: "저장해 줘" });
    validFollowup(events, forecastId);
    const calls = harness.calls.slice(before);
    expect(calls.map((call) => call.url.pathname)).toEqual([
      `/v1/snapshots/${forecastId}`,
      `/v1/events/${report.event.id}`,
    ]);
    expect(calls.filter((call) => call.body)).toHaveLength(0);
    expect(harness.snapshots.size).toBe(0);
    expect(JSON.stringify(events)).toContain(
      "저장하지 못했어요 — 잠시 뒤 다시 눌러 주세요",
    );
  },
);

// 발행 전 단독 저장은 받아쓰기나 records 호출 없이 먼저 예보를 요청한다
it("발행 전 저장 요청은 먼저 예보를 받도록 안내한다", async () => {
  const harness = teamFixture();
  const events = await harness.message(await harness.create(), {
    text: "저장해 줘",
  });
  validSequence(events);
  expect(events).toMatchObject([
    {
      event: "error",
      data: {
        code: "OUT_OF_SCOPE",
        message: "먼저 예보를 받아야 저장할 수 있어요",
      },
    },
    { event: "done", data: { forecastId: null } },
  ]);
  expect(harness.calls).toHaveLength(0);
});

// 없음 이외 조회 장애는 덮어쓰기 대신 안내하고 게이트·suggest 없이 끝낸다
it("records 조회 장애는 저장하지 못했다는 안내를 남긴다", async () => {
  let unavailable = false;
  const harness = followupFixture({
    override: async ({ url }) =>
      unavailable && url.pathname.startsWith("/v1/snapshots/")
        ? new Response(null, { status: 503 })
        : undefined,
  });
  const { id, forecastId } = await harness.publish();
  unavailable = true;
  const before = harness.calls.length;
  const events = await harness.message(id, { text: "보관해 줘" });
  validFollowup(events, forecastId);
  expect(JSON.stringify(events)).toContain(
    "저장하지 못했어요 — 잠시 뒤 다시 눌러 주세요",
  );
  expect(harness.calls.slice(before)).toHaveLength(1);
});

// 늦은 저장 응답은 5초 예산을 넘기지 않고 취소 신호와 재시도 안내로 끝낸다
it("저장 재시도가 멈추면 5초 안에 취소하고 기존 id를 유지한다", async () => {
  let stalled = false;
  let signal: AbortSignal | null | undefined;
  const harness = followupFixture({
    override: async (call) => {
      if (stalled && call.url.pathname.endsWith("/snapshots")) {
        signal = call.signal;
        return new Promise(() => {});
      }
    },
  });
  const { id, forecastId } = await harness.publish();
  harness.snapshots.clear();
  stalled = true;
  const start = performance.now();
  const events = await harness.message(id, { text: "저장해 줘" });
  validFollowup(events, forecastId);
  expect(performance.now() - start).toBeLessThan(5_700);
  expect(signal?.aborted).toBe(true);
  expect(JSON.stringify(events)).toContain(
    "저장하지 못했어요 — 잠시 뒤 다시 눌러 주세요",
  );
}, 7_000);
