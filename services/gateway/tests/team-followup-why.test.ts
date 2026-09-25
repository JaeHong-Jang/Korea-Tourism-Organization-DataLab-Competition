// 후속 설명의 재발행·근거·검증 실패가 실제 스트림 계약을 지키는지 확인한다
import { writeFileSync } from "node:fs";
import type { Claim, GateReport } from "@crowdcast/contracts/types";
import { expect, it, vi } from "vitest";
import { whyExplainer } from "../src/team/report/why-templates.js";
import {
  MODEL_NOTICE,
  REVIEW_NOTICE,
} from "../src/team/verification/skeptic.js";
import {
  claimsIn,
  followupFixture,
  validFollowup,
} from "./followup-fixture.js";
import { oodForecast } from "./report-fixture.js";

// 숫자 카드는 재전송하지 않고 처음 발행할 때 쓴 사례·평시·모델 근거를 설명한다
it("왜 이렇게 많아는 규칙만으로 설명을 검증·발행한다", async () => {
  const harness = followupFixture({ forecast: oodForecast });
  const { id, forecastId, report } = await harness.publish();
  const before = harness.calls.length;
  const events = await harness.message(id, { text: "왜 이렇게 많아?" });
  validFollowup(events, forecastId);
  const calls = harness.calls.slice(before);
  expect(calls.some((call) => call.url.pathname === "/api/chat")).toBe(false);
  expect(
    events.find((event) => event.event === "agent_step")?.data,
  ).toMatchObject({
    agentId: "lead",
    usedLlm: false,
    note: "요청 분류: why (규칙)",
  });
  expect(
    events
      .filter((event) => event.event === "gate")
      .map((event) => [
        (event.data as GateReport).gate,
        (event.data as GateReport).passed,
      ]),
  ).toEqual([
    ["B", true],
    ["publish", true],
  ]);
  const claims = claimsIn(events);
  expect(claims.map((claim) => claim.text)).toEqual(
    expect.arrayContaining([
      MODEL_NOTICE,
      REVIEW_NOTICE,
      "비슷한 과거 행사 기록을 근거로 삼았어요",
      "개최 지역의 평시 방문 자료를 함께 봤어요",
      "예측 모델이 추정한 범위를 따랐어요",
    ]),
  );
  expect(
    claims
      .filter((claim) => claim.claimType === "요인")
      .map((claim) => claim.text),
  ).toEqual(report.forecast.factors.slice(0, 3).map((factor) => factor.label));
  for (const claim of claims) {
    expect(claim.evidenceIds.length).toBeGreaterThan(0);
    expect(claim.text).not.toMatch(/\p{N}/u);
    expect(claim.rendered).toBe(claim.text);
    expect(["요인", "설명"]).toContain(claim.claimType);
    expect(claim.checks).toHaveLength(4);
    expect(claim.checks.every((check) => check.passed)).toBe(true);
  }
  expect(events.findIndex((event) => event.event === "claim")).toBeGreaterThan(
    events.findIndex(
      (event) =>
        event.event === "gate" && (event.data as GateReport).gate === "publish",
    ),
  );
  expect(calls.some((call) => call.url.pathname.startsWith("/v1/events"))).toBe(
    false,
  );
  expect(harness.snapshots.get(forecastId)).toEqual(report);
});

// 이미 published인 문장은 재적재하지 않으며 새 id만 같은 내용·근거로 발행한다
it("같은 이유 질문을 두 번 해도 같은 근거와 새 id로 발행한다", async () => {
  const harness = followupFixture();
  const { id, forecastId, report } = await harness.publish();
  const before = harness.calls.length;
  const first = await harness.message(id, { text: "이유와 근거를 알려 줘" });
  const second = await harness.message(id, { text: "이유와 근거를 알려 줘" });
  validFollowup(first, forecastId);
  validFollowup(second, forecastId);
  const firstClaims = claimsIn(first);
  const secondClaims = claimsIn(second);
  expect(firstClaims.length).toBeGreaterThan(0);
  expect(
    secondClaims.map(({ text, evidenceIds }) => ({ text, evidenceIds })),
  ).toEqual(
    firstClaims.map(({ text, evidenceIds }) => ({ text, evidenceIds })),
  );
  expect(
    secondClaims.every(
      (claim) => !firstClaims.some((first) => first.id === claim.id),
    ),
  ).toBe(true);
  const calls = harness.calls.slice(before);
  expect(
    calls.filter((call) => call.url.pathname === "/api/chat"),
  ).toHaveLength(0);
  const written = calls
    .filter((call) => call.url.pathname.endsWith("/facts"))
    .flatMap((call) => (call.body as { items: Claim[] }).items);
  expect(
    written.every((claim) => !report.claims.some((old) => old.id === claim.id)),
  ).toBe(true);
  const firstGate = first.find((event) => event.event === "gate")
    ?.data as GateReport;
  const secondGate = second.find((event) => event.event === "gate")
    ?.data as GateReport;
  expect(secondGate.revision).toBe(firstGate.revision + 1);

  // 선택한 실행에서만 최초 발행과 후속 두 번의 사실·게이트 순서를 실제 SHACL에 넘긴다
  if (process.env.T305_CALLS_OUT)
    writeFileSync(
      process.env.T305_CALLS_OUT,
      JSON.stringify({
        sessionId: id,
        calls: harness.calls
          .filter((call) =>
            /\/(facts|validate|publish)$/.test(call.url.pathname),
          )
          .map((call) => ({
            action: call.url.pathname.split("/").at(-1),
            shapes: call.url.searchParams.get("shapes"),
            body: call.body,
          })),
      }),
    );
});

// 템플릿 실패 뒤 재작성하지 않고 기존 예보 id로 끝내며 다음 질문은 새 revision으로 재개한다
it("게이트 B 차단은 미발행으로 끝나고 다음 why는 정상 발행한다", async () => {
  let blocked = false;
  const harness = followupFixture({
    override: async ({ url }) => {
      if (blocked && url.pathname.endsWith("/validate"))
        return Response.json({
          gate: "B",
          passed: false,
          revision: Number(url.searchParams.get("revision")),
          masterVersion: 7,
          violations: [
            {
              check: "shacl",
              shapeId: "S11",
              nodeId: "c-yeongjong",
              message: "작성자 검사 실패",
            },
          ],
        });
    },
  });
  const { id, forecastId } = await harness.publish();
  blocked = true;
  const before = harness.calls.length;
  const events = await harness.message(id, { text: "왜?" });
  validFollowup(events, forecastId);
  expect(events.filter((event) => event.event === "gate")).toHaveLength(1);
  expect(
    events.filter((event) =>
      ["claim", "evidence", "suggest"].includes(event.event),
    ),
  ).toEqual([]);
  expect(events.slice(-2)).toMatchObject([
    {
      event: "error",
      data: {
        code: "SERVICE_UNAVAILABLE",
        message: "설명 문장을 검증하지 못했어요",
      },
    },
    { event: "done", data: { forecastId } },
  ]);
  expect(
    harness.calls
      .slice(before)
      .some((call) => call.url.pathname.endsWith("/publish")),
  ).toBe(false);
  blocked = false;
  const retry = await harness.message(id, { text: "왜?" });
  validFollowup(retry, forecastId);
  expect(claimsIn(retry).length).toBeGreaterThan(0);
});

// 숫자·없는 근거·잘못된 요인도 템플릿이라는 이유로 통과시키지 않는다
it.each(["number", "evidence", "factor"])(
  "훼손된 why %s는 발행하지 않는다",
  async (mode) => {
    const harness = followupFixture();
    const { id, forecastId } = await harness.publish();
    const run = whyExplainer.run;
    vi.spyOn(whyExplainer, "run").mockImplementation(async (ctx) => {
      const result = await run(ctx);
      if (mode === "number") result.value[0].text += " 100명";
      if (mode === "evidence") result.value[0].evidenceIds = [];
      if (mode === "factor") result.value[0].text = "방문 인원이 줄어요";
      return result;
    });
    const events = await harness.message(id, { text: "왜?" });
    validFollowup(events, forecastId);
    expect(claimsIn(events)).toEqual([]);
    expect(events.at(-2)).toMatchObject({
      event: "error",
      data: { message: "설명 문장을 검증하지 못했어요" },
    });
  },
);
