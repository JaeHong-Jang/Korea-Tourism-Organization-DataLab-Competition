// 재예보의 게이트 거부·해설 호출 상한·검산 실패가 발행과 저장을 막는지 확인한다
import { expect, it, vi } from "vitest";
import { explainer } from "../src/team/report/explainer.js";
import { failedGate, reforecastFixture } from "./reforecast-fixture.js";
import { validSequence } from "./team-fixture.js";

// 분석 거부는 보고팀 호출 전에, 설명 거부는 재작성 상한 안에서 종료한다
it.each(["A", "B"] as const)(
  "게이트 %s 실패는 409이고 발행·records 저장이 없다",
  async (gate) => {
    const harness = reforecastFixture({
      override: async ({ url }) => {
        if (
          url.pathname.endsWith("/validate") &&
          (url.searchParams.get("shapes")?.includes("S01") ? "B" : "A") === gate
        )
          return failedGate(url, gate);
      },
    });
    const response = await harness.request();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: gate === "A" ? "ANALYSIS_GATE_FAILED" : "EXPLANATION_GATE_FAILED",
      message: expect.stringContaining(`게이트 ${gate}`),
    });
    expect(
      harness.calls.some((call) => call.url.pathname.endsWith("/publish")),
    ).toBe(false);
    expect(
      harness.calls.some(
        (call) => call.method === "POST" && call.url.host === "records.test",
      ),
    ).toBe(false);
    expect(harness.snapshots).toEqual([]);
    expect(harness.llmCalls()).toBe(gate === "A" ? 0 : 2);
    validSequence(harness.traces[0]);
  },
);

// 한 번 실패한 설명은 새 문장으로 검증하고 통과한 revision만 발행한다
it("게이트 B 한 번 거부 뒤 재작성해도 LLM은 두 번만 호출한다", async () => {
  let checks = 0;
  const harness = reforecastFixture({
    override: async ({ url }) => {
      if (
        url.pathname.endsWith("/validate") &&
        url.searchParams.get("shapes")?.includes("S01") &&
        ++checks === 1
      )
        return failedGate(url, "B");
    },
  });
  expect((await harness.request()).status).toBe(200);
  expect(harness.llmCalls()).toBe(2);
  expect(checks).toBe(2);
  expect(harness.snapshots).toHaveLength(1);
  validSequence(harness.traces[0]);
});

// 정상 해설과 재작성 모두 거절되면 추가 LLM 없이 템플릿을 검증한다
it("두 해설 거부 뒤 템플릿이 통과하면 LLM 두 번으로 발행한다", async () => {
  let checks = 0;
  const harness = reforecastFixture({
    override: async ({ url }) => {
      if (
        url.pathname.endsWith("/validate") &&
        url.searchParams.get("shapes")?.includes("S01") &&
        ++checks <= 2
      )
        return failedGate(url, "B");
    },
  });
  expect((await harness.request()).status).toBe(200);
  expect(harness.llmCalls()).toBe(2);
  expect(checks).toBe(3);
  validSequence(harness.traces[0]);
});

// 그래프 승인 응답이 있어도 문장에 새 숫자를 넣으면 코드 검산이 거부한다
it("숫자 검산에 실패한 템플릿은 409이며 발행하지 않는다", async () => {
  const run = explainer.run;
  vi.spyOn(explainer, "run").mockImplementation(async (ctx) => {
    const result = await run(ctx);
    const quantity = result.value.claims.find(
      (claim) => claim.claimType === "수치",
    );
    if (quantity) quantity.text += " 9999명";
    return result;
  });
  const harness = reforecastFixture();
  const response = await harness.request();
  expect(response.status).toBe(409);
  expect((await response.json()).code).toBe("EXPLANATION_GATE_FAILED");
  expect(harness.llmCalls()).toBe(2);
  expect(
    harness.calls.some((call) => call.url.pathname.endsWith("/publish")),
  ).toBe(false);
  expect(harness.snapshots).toEqual([]);
});

// 설명할 요인이 없으면 받아쓰기나 분류로 돌아가지 않고 템플릿만 검증한다
it("요인이 없으면 LLM 호출 없이 발행한다", async () => {
  const harness = reforecastFixture({
    forecast: (forecast) => ({ ...forecast, factors: [] }),
  });
  expect((await harness.request()).status).toBe(200);
  expect(harness.llmCalls()).toBe(0);
});

// LLM 자체 장애도 기존 템플릿 경로로 복구하되 두 게이트는 생략하지 않는다
it("Ollama 장애는 템플릿 검증 후 발행한다", async () => {
  const harness = reforecastFixture({
    override: async ({ url }) => {
      if (url.pathname === "/api/chat")
        return new Response(null, { status: 503 });
    },
  });
  expect((await harness.request()).status).toBe(200);
  expect(
    harness.calls.filter((call) => call.url.pathname === "/api/chat"),
  ).toHaveLength(1);
  validSequence(harness.traces[0]);
});

// 발행 승인이 거부되거나 검증한 범위와 다르면 records에 쓰지 않는다
it.each(["거부", "revision", "masterVersion"])(
  "발행 %s는 409이며 스냅샷을 저장하지 않는다",
  async (failure) => {
    const harness = reforecastFixture({
      override: async ({ url }) => {
        if (!url.pathname.endsWith("/publish")) return;
        if (failure === "거부") return failedGate(url, "publish");
        return Response.json({
          gate: "publish",
          passed: true,
          revision: Number(url.searchParams.get("revision")),
          masterVersion: 7,
          violations: [],
          [failure]: 999,
        });
      },
    });
    expect((await harness.request()).status).toBe(409);
    expect(harness.snapshots).toEqual([]);
    expect(harness.traces[0].some((event) => event.event === "claim")).toBe(
      false,
    );
  },
);
