// 세션 없는 예보별 초안 생성이 상담의 계획·저장 충돌·오류 계약을 그대로 지키는지 검사한다
import { readdirSync } from "node:fs";
import type { Plan } from "@crowdcast/contracts/types";
import { beforeEach, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { validFollowup } from "./followup-fixture.js";
import { planProblem, planRecordsFixture } from "./plan-records-fixture.js";
import {
  proxyConfig,
  report as snapshot,
  plan as storedPlan,
} from "./proxy-fixture.js";

// 상류 계약 위반을 의도적으로 만드는 테스트의 오류 로그를 숨긴다
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// 상담을 만들지 않고 records에 있는 발행 스냅샷만 새 앱에서 읽는다
it("세션 없이 초안을 만들고 두 번째 요청에도 최초 계획 바이트를 반환한다", async () => {
  const harness = planRecordsFixture();
  harness.snapshots.set(snapshot.forecastId, structuredClone(snapshot));
  const app = createApp(proxyConfig, harness.fetcher);
  const path = `/api/forecasts/${snapshot.forecastId}/plan`;
  const first = await app.request(path, { method: "POST" });
  expect(first.status).toBe(200);
  expect(first.headers.get("content-type")).toContain("application/json");
  const bytes = await first.text();
  const { plan, docxHref }: { plan: Plan; docxHref: string } =
    JSON.parse(bytes);
  expect(planProblem(plan, snapshot)).toBeNull();
  expect(plan.id).toBe(`plan-${snapshot.forecastId.slice(2)}`);
  expect(docxHref).toBe(`/api/plans/${plan.id}/export.docx`);
  expect(harness.calls.map((call) => call.url.pathname)).toEqual([
    `/v1/snapshots/${snapshot.forecastId}`,
    "/v1/plans",
  ]);

  // 재시도 시각과 앱의 메모리가 달라도 409 뒤 기존 계획을 그대로 조회한다
  vi.setSystemTime(new Date("2026-09-26T03:00:00Z"));
  const second = await createApp(proxyConfig, harness.fetcher).request(path, {
    method: "POST",
  });
  expect(second.status).toBe(200);
  expect(Buffer.from(await second.text())).toEqual(Buffer.from(bytes));
  expect(harness.plans.size).toBe(1);
  expect(harness.calls.slice(2).map((call) => call.url.pathname)).toEqual([
    `/v1/snapshots/${snapshot.forecastId}`,
    "/v1/plans",
    `/v1/plans/${plan.id}`,
  ]);
  expect(harness.snapshots.get(snapshot.forecastId)).toEqual(snapshot);
  expect(readdirSync(harness.traceDirectory)).toEqual([]);
});

// 두 진입 순서 모두 실제 상담 스트림과 별도 HTTP 앱이 같은 records 초안을 사용한다
it.each(["session", "forecast"])(
  "%s 경로가 먼저여도 상담과 예보별 경로의 계획 바이트가 같다",
  async (firstRoute) => {
    const harness = planRecordsFixture();
    const { id, forecastId } = await harness.publish();
    const planId = `plan-${forecastId.slice(2)}`;
    const app = createApp(proxyConfig, harness.fetcher);
    const request = () =>
      app.request(`/api/forecasts/${forecastId}/plan`, { method: "POST" });
    let firstBytes: string;
    if (firstRoute === "session") {
      validFollowup(
        await harness.message(id, { text: "계획 초안 만들어 줘" }),
        forecastId,
      );
      firstBytes = JSON.stringify(harness.plans.get(planId));
    } else {
      const response = await request();
      expect(response.status).toBe(200);
      firstBytes = JSON.stringify((await response.json()).plan);
    }

    // 후속 설명이 추가되어도 계획은 최초 스냅샷만 사용하고 기존 시각을 유지한다
    vi.setSystemTime(new Date("2026-09-26T03:00:00Z"));
    validFollowup(await harness.message(id, { text: "왜?" }), forecastId);
    const sessionEvents = await harness.message(id, {
      text: "계획 초안 만들어 줘",
    });
    validFollowup(sessionEvents, forecastId);
    const traceBefore = harness.trace(id);
    const response = await request();
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(Buffer.from(JSON.stringify(result.plan))).toEqual(
      Buffer.from(firstBytes),
    );
    expect(Buffer.from(JSON.stringify(harness.plans.get(planId)))).toEqual(
      Buffer.from(firstBytes),
    );
    expect(sessionEvents.at(-2)?.data).toMatchObject({
      actions: [{ href: result.docxHref }],
    });
    expect(harness.trace(id)).toEqual(traceBefore);
    expect(harness.plans.size).toBe(1);
  },
);

// 미발행·없는 예보는 계획 저장 없이 명시한 오류 본문으로 끝낸다
it("스냅샷이 없으면 404 not_found를 반환한다", async () => {
  const harness = planRecordsFixture();
  const response = await createApp(proxyConfig, harness.fetcher).request(
    "/api/forecasts/f-sorae-2026/plan",
    { method: "POST" },
  );
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "not_found" });
  expect(harness.calls.map((call) => call.url.pathname)).toEqual([
    "/v1/snapshots/f-sorae-2026",
  ]);
  expect(harness.plans.size).toBe(0);
});

// records가 거부한 계획의 원문이나 내부 검증 이유는 응답에 노출하지 않는다
it("records 422는 502 plan_rejected로 반환한다", async () => {
  const harness = planRecordsFixture({
    override: async ({ url }) => {
      if (url.pathname === "/v1/plans")
        return Response.json(
          { error: "invalid_plan", message: "발행 문장 검증 거부" },
          { status: 422 },
        );
    },
  });
  harness.snapshots.set(snapshot.forecastId, structuredClone(snapshot));
  const response = await createApp(proxyConfig, harness.fetcher).request(
    `/api/forecasts/${snapshot.forecastId}/plan`,
    { method: "POST" },
  );
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: "plan_rejected" });
  expect(harness.plans.size).toBe(0);
});

// 계약에 맞지 않거나 다른 예보의 스냅샷으로는 새 계획을 저장하지 않는다
it.each(["schema", "forecastId"])(
  "스냅샷 %s 위반은 503이고 저장을 호출하지 않는다",
  async (invalid) => {
    const report = structuredClone(snapshot);
    if (invalid === "schema") Object.assign(report, { claims: null });
    if (invalid === "forecastId") report.forecastId = "f-sorae-2026";
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(report));
    const response = await createApp(proxyConfig, fetcher).request(
      `/api/forecasts/${snapshot.forecastId}/plan`,
      { method: "POST" },
    );
    expect(response.status).toBe(503);
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

// 충돌 조회가 실패하거나 다른 예보 범위의 계획을 반환하면 링크를 발행하지 않는다
it.each([
  ["missing", ""],
  ["forecastId", "f-sorae-2026"],
  ["eventId", "e-sorae-2026"],
  ["sessionId", "s-sorae-2026"],
  ["id", "plan-sorae-2026"],
])("409 뒤 기존 계획 %s 위반은 503으로 반환한다", async (invalid, value) => {
  const harness = planRecordsFixture({
    override: async ({ url }) => {
      if (url.pathname === "/v1/plans")
        return new Response(null, { status: 409 });
      if (url.pathname.startsWith("/v1/plans/")) {
        if (invalid === "missing") return new Response(null, { status: 404 });
        const plan = {
          ...structuredClone(storedPlan),
          id: `plan-${snapshot.forecastId.slice(2)}`,
          [invalid]: value,
        };
        return Response.json(plan);
      }
    },
  });
  harness.snapshots.set(snapshot.forecastId, structuredClone(snapshot));
  const response = await createApp(proxyConfig, harness.fetcher).request(
    `/api/forecasts/${snapshot.forecastId}/plan`,
    { method: "POST" },
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
});

// 잘못된 식별자와 인코딩된 경로 조각은 records에 전달하지 않는다
it.each(["bad", "f-", "f-a%2Fb", "f-a%252Fb"])(
  "예보 id %s는 저장 전에 400으로 거부한다",
  async (id) => {
    const fetcher = vi.fn<typeof fetch>();
    const response = await createApp(proxyConfig, fetcher).request(
      `/api/forecasts/${id}/plan`,
      { method: "POST" },
    );
    expect(response.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  },
);
