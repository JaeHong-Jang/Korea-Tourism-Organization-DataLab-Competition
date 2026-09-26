// 후속 설명의 발행·후보 정리 장애가 같은 상담의 다음 발행을 막지 않는지 확인한다

import { writeFileSync } from "node:fs";
import type { Claim, GateReport } from "@crowdcast/contracts/types";
import { expect, it } from "vitest";
import type { SessionFacts } from "../src/contract/session-facts.js";
import {
  claimsIn,
  followupFixture,
  validFollowup,
} from "./followup-fixture.js";
import { isReplyCall, withoutReplyEvents } from "./reply-fixture.js";
import type { Call } from "./team-fixture.js";

// 최초 예보가 끝난 뒤의 통신 실패와 발행 거부를 각각 주입한다
it.each(["publish-http", "publish-rejected", "validate-http"])(
  "%s 뒤 후보를 폐기하고 다음 why를 발행한다",
  async (failure) => {
    let blocked = false;
    const failedCalls = new Set<Call>();
    const harness = followupFixture({
      override: async (call) => {
        const path = failure === "validate-http" ? "/validate" : "/publish";
        if (!blocked || !call.url.pathname.endsWith(path)) return;
        failedCalls.add(call);
        if (failure !== "publish-rejected")
          return new Response(null, { status: 503 });
        return Response.json({
          gate: "publish",
          passed: false,
          revision: Number(call.url.searchParams.get("revision")),
          masterVersion: 7,
          violations: [
            {
              check: "shacl",
              shapeId: "S12",
              nodeId: null,
              message: "발행 실패 주입",
            },
          ],
        });
      },
    });
    const { id, forecastId, report } = await harness.publish();
    const original = harness.knowledgeClaims(id);
    blocked = true;
    const before = harness.calls.filter((call) => !isReplyCall(call)).length;
    const failed = await harness.message(id, { text: "왜 이렇게 많아?" });
    validFollowup(failed, forecastId);
    expect(withoutReplyEvents(failed).at(-2)).toMatchObject({
      event: "error",
      data: {
        code: "SERVICE_UNAVAILABLE",
        message: "설명 문장을 검증하지 못했어요",
      },
    });
    expect(
      failed.filter((event) =>
        ["claim", "evidence", "suggest"].includes(event.event),
      ),
    ).toEqual([]);

    // 상태만 rejected로 바뀌며 최초 발행 묶음과 검사·본문은 그대로 남아야 한다
    const candidates = harness.calls
      .filter((call) => !isReplyCall(call))
      .slice(before)
      .filter((call) => call.url.pathname.endsWith("/facts"))
      .flatMap((call) => (call.body as { items: Claim[] }).items)
      .filter((claim) => claim.status === "candidate");
    expect(candidates.length).toBeGreaterThan(0);
    expect(harness.knowledgeClaims(id)).toEqual([
      ...original,
      ...candidates.map((claim) => ({ ...claim, status: "rejected" })),
    ]);
    blocked = false;
    const retried = await harness.message(id, { text: "왜 이렇게 많아?" });
    validFollowup(retried, forecastId);
    const claims = claimsIn(retried);
    expect(claims.length).toBe(candidates.length);
    expect(
      retried
        .filter((event) => event.event === "gate")
        .map((event) => [
          (event.data as GateReport).gate,
          (event.data as GateReport).passed,
        ]),
    ).toEqual([
      ["B", true],
      ["publish", true],
    ]);
    expect(
      harness
        .knowledgeClaims(id)
        .filter((claim) => claim.status === "candidate"),
    ).toEqual([]);
    expect(harness.knowledgeClaims(id)).toEqual([
      ...original,
      ...candidates.map((claim) => ({ ...claim, status: "rejected" })),
      ...claims,
    ]);
    expect(harness.snapshots.get(forecastId)).toEqual(report);

    // 선택한 실행은 실패 요청을 표시해 실제 메모리 knowledge에서도 복구 순서를 재생한다
    if (failure === "publish-http" && process.env.T305_RECOVERY_CALLS_OUT)
      writeFileSync(
        process.env.T305_RECOVERY_CALLS_OUT,
        JSON.stringify({
          sessionId: id,
          expectedGates: 6,
          calls: harness.calls
            .filter((call) => !isReplyCall(call))
            .filter((call) =>
              /\/(facts|validate|publish)$/.test(call.url.pathname),
            )
            .map((call) => ({
              action: call.url.pathname.split("/").at(-1),
              shapes: call.url.searchParams.get("shapes"),
              body: call.body,
              failed: failedCalls.has(call),
            })),
        }),
      );
  },
);

// 실패 직후 정리가 막히면 새 초안을 쓰기 전에 같은 후보부터 폐기한다
it.each([1, 2])(
  "후보 정리가 %i회 실패해도 다음 why에서 정리 후 발행한다",
  async (cleanupFailures) => {
    let blocked = false;
    let remaining = cleanupFailures;
    const harness = followupFixture({
      override: async ({ url, body }) => {
        if (blocked && url.pathname.endsWith("/publish"))
          return new Response(null, { status: 503 });
        const facts = body as SessionFacts | undefined;
        if (
          url.pathname.endsWith("/facts") &&
          facts?.schema === "claim" &&
          facts.items.some((claim) => claim.status === "rejected") &&
          remaining-- > 0
        )
          return new Response(null, { status: 503 });
      },
    });
    const { id, forecastId } = await harness.publish();
    blocked = true;
    const failed = await harness.message(id, { text: "왜?" });
    validFollowup(failed, forecastId);
    const pending = harness
      .knowledgeClaims(id)
      .filter((claim) => claim.status === "candidate");
    expect(pending.length).toBeGreaterThan(0);
    expect(claimsIn(failed)).toEqual([]);
    blocked = false;

    // 시작 시 정리가 실패한 요청은 새 초안과 게이트를 만들지 않고 후보를 보존한다
    if (cleanupFailures === 2) {
      const before = harness.calls.filter((call) => !isReplyCall(call)).length;
      const failedAgain = await harness.message(id, { text: "왜?" });
      validFollowup(failedAgain, forecastId);
      expect(withoutReplyEvents(failedAgain).at(-2)).toMatchObject({
        event: "error",
      });
      expect(failedAgain.some((event) => event.event === "gate")).toBe(false);
      const facts = harness.calls
        .filter((call) => !isReplyCall(call))
        .slice(before)
        .filter((call) => call.url.pathname.endsWith("/facts"));
      expect(facts).toHaveLength(1);
      expect(facts[0].body).toEqual({
        schema: "claim",
        items: pending.map((claim) => ({ ...claim, status: "rejected" })),
      });
      expect(
        harness
          .knowledgeClaims(id)
          .filter((claim) => claim.status === "candidate"),
      ).toEqual(pending);
    }

    // 정리에 성공한 뒤에만 새 내용 revision을 만들고 발행까지 진행한다
    const before = harness.calls.filter((call) => !isReplyCall(call)).length;
    const recovered = await harness.message(id, { text: "왜?" });
    validFollowup(recovered, forecastId);
    expect(claimsIn(recovered).length).toBeGreaterThan(0);
    const facts = harness.calls
      .filter((call) => !isReplyCall(call))
      .slice(before)
      .filter((call) => call.url.pathname.endsWith("/facts"));
    expect(facts[0].body).toEqual({
      schema: "claim",
      items: pending.map((claim) => ({ ...claim, status: "rejected" })),
    });
    expect(
      (facts[1].body as { items: Claim[] }).items.every(
        (claim) => claim.status === "draft",
      ),
    ).toBe(true);
    expect(
      harness
        .knowledgeClaims(id)
        .filter((claim) => claim.status === "candidate"),
    ).toEqual([]);
  },
);

// 발행이 저장소에 반영된 뒤 응답만 유실돼도 다음 why가 막히지 않는다
it("발행 응답 유실 뒤에도 다음 why를 발행한다", async () => {
  let lose = false;
  const harness = followupFixture({
    afterResponse: async (call, response) => {
      if (!lose || !call.url.pathname.endsWith("/publish")) return;
      lose = false;
      await response.body?.cancel();
      return new Response(null, { status: 503 });
    },
  });
  const { id, forecastId } = await harness.publish();
  lose = true;
  const failed = await harness.message(id, { text: "왜 이렇게 많아?" });
  validFollowup(failed, forecastId);
  expect(failed.some((event) => event.event === "claim")).toBe(false);
  // 유실된 발행 문장은 저장소에서 이미 published다(폐기 전이는 거부된다)
  expect(
    harness.knowledgeClaims(id).some((claim) => claim.status === "candidate"),
  ).toBe(false);
  const retried = await harness.message(id, { text: "왜 이렇게 많아?" });
  validFollowup(retried, forecastId);
  expect(claimsIn(retried).length).toBeGreaterThan(0);
  expect(
    harness.knowledgeClaims(id).some((claim) => claim.status === "candidate"),
  ).toBe(false);
});
