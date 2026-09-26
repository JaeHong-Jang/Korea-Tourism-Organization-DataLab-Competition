// 목록 행사 선택이 추출·지오코딩 없이 공통 분석·발행 게이트를 통과하는지 검증한다
import type { AgentStep } from "@crowdcast/contracts/types";
import { expect, it } from "vitest";
import { report } from "./proxy-fixture.js";
import { teamFixture, validSequence } from "./team-fixture.js";

// 이미 확정된 행사 입력을 그대로 사용하며 카드도 한 번만 내보낸다
it("eventId로 추출·되묻기 없이 평시·유사 근거 뒤 새 예보를 발행한다", async () => {
  const event = report.event;
  const harness = teamFixture({
    override: async ({ url }) =>
      url.pathname === `/v1/festivals/upcoming/${event.id}/event`
        ? Response.json(event)
        : undefined,
  });
  const events = await harness.message(await harness.create(), {
    text: "이 행사 예보",
    eventId: event.id,
  });
  validSequence(events);
  expect(events.filter((item) => item.event === "event_card")).toHaveLength(1);
  expect(events.filter((item) => item.event === "ask")).toEqual([]);
  expect(events.some((item) => item.event === "claim")).toBe(true);
  const steps = events
    .filter((item) => item.event === "agent_step")
    .map((item) => item.data as AgentStep);
  expect(steps.some((step) => step.agentId === "dictation")).toBe(false);
  expect(
    harness.calls.some((call) => call.url.pathname === "/v1/geocode"),
  ).toBe(false);
  const facts = harness.calls
    .filter((call) => call.url.pathname.endsWith("/facts"))
    .map((call) => call.body as { schema: string; items: unknown[] });
  expect(facts[0]).toEqual({ schema: "event", items: [event] });
  expect(
    facts
      .slice(1, 3)
      .map((fact) => fact.schema)
      .sort(),
  ).toEqual(["region-baseline", "similar-event"]);
  expect(
    harness.calls.find((call) => call.url.pathname === "/v1/predict")?.body,
  ).toEqual(event);
  expect(events.at(-1)?.data).toMatchObject({
    forecastId: expect.stringMatching(/^f-/),
  });
});

// 없는 id나 다른 행사 응답을 새 행사 입력으로 추정하지 않는다
it.each([404, 200])(
  "행사 조회 실패·불일치(%s)는 카드 없이 오류로 끝난다",
  async (status) => {
    const harness = teamFixture({
      override: async () =>
        status === 404
          ? new Response(null, { status })
          : Response.json(report.event),
    });
    const events = await harness.message(await harness.create(), {
      text: "",
      eventId: "e-not-found",
    });
    validSequence(events);
    expect(events.some((item) => item.event === "error")).toBe(true);
    expect(
      events.some((item) =>
        ["ask", "event_card", "forecast"].includes(item.event),
      ),
    ).toBe(false);
    expect(events.at(-1)?.data).toMatchObject({ forecastId: null });
  },
);

// path 조각이 아닌 문자열은 HTTP 입구에서 거부한다
it.each(["../event", "", null, 42])(
  "잘못된 eventId=%s는 400이다",
  async (eventId) => {
    const harness = teamFixture();
    const id = await harness.create();
    const response = await harness.app.request(
      `/api/team/sessions/${id}/messages`,
      { method: "POST", body: JSON.stringify({ text: "", eventId }) },
    );
    expect(response.status).toBe(400);
    expect(harness.calls).toEqual([]);
  },
);

// 같은 선택을 반복해 결정적 예보 id가 같아도 실제 발행한 id로 완료한다
it("같은 행사 재선택과 발행 뒤 방문객 검색을 구분한다", async () => {
  const event = report.event;
  const harness = teamFixture({
    override: async ({ url }) => {
      if (url.pathname === `/v1/festivals/upcoming/${event.id}/event`)
        return Response.json(event);
      if (url.pathname === "/v1/festivals/upcoming") return Response.json([]);
      return undefined;
    },
  });
  const id = await harness.create();
  const first = await harness.message(id, { text: "", eventId: event.id });
  const again = await harness.message(id, { text: "", eventId: event.id });
  validSequence(again);
  expect(again.at(-1)?.data).toEqual(first.at(-1)?.data);
  expect(again.some((item) => item.event === "claim")).toBe(true);
  const why = await harness.message(id, { text: "근거는 어디에서 찾았어?" });
  expect(why.some((item) => item.event === "claim")).toBe(true);
  expect(why.some((item) => item.event === "recommend")).toBe(false);
  const search = await harness.message(id, { text: "다른 축제 추천" });
  expect(search.at(-1)?.data).toMatchObject({ forecastId: null });
});
