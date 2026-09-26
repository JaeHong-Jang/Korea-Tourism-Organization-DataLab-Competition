// 계획 초안의 실제 상담 스트림·records 저장·중복 조회·오류 안내를 함께 검증한다

import type { Plan } from "@crowdcast/contracts/types";
import { expect, it, vi } from "vitest";
import { validFollowup } from "./followup-fixture.js";
import { planProblem, planRecordsFixture } from "./plan-records-fixture.js";
import { isReplyCall, withoutReplyEvents } from "./reply-fixture.js";
import { teamFixture, validSequence } from "./team-fixture.js";

// 독립적인 주제 권고를 예측 응답에 추가한 뒤 최초 발행 검증까지 통과시킨다
it("최초 발행 문장만 9섹션에 저장하고 링크만 전송한다", async () => {
  const harness = planRecordsFixture({
    forecast: (forecast) => {
      for (const [id, text] of [
        ["routes", "대피 동선과 출입구를 점검해요"],
        ["medical", "의료 지원과 화장실 안내를 준비해요"],
        ["fire", "폭죽 안전거리를 확인해요"],
      ])
        forecast.judgment.checklist.push({
          ...forecast.judgment.checklist[0],
          id: `ck-${id}`,
          text,
        });
      return forecast;
    },
  });
  const { id, forecastId, report } = await harness.publish();
  const why = await harness.message(id, { text: "왜?" });
  validFollowup(why, forecastId);
  const whyIds = why
    .filter((event) => event.event === "claim")
    .map((event) => (event.data as { id: string }).id);
  const before = harness.calls.filter((call) => !isReplyCall(call)).length;
  const events = await harness.message(id, { text: "계획 초안 만들어 줘" });
  validFollowup(events, forecastId);
  const planId = `plan-${forecastId.slice(2)}`;
  const plan = harness.plans.get(planId);
  expect(plan).toBeDefined();
  if (!plan) throw new Error("계획 저장 실패");
  expect(planProblem(plan, report)).toBeNull();
  expect(plan.sections.map((section) => section.status)).toEqual([
    "작성됨",
    "검토 필요",
    "작성됨",
    "작성됨",
    "검토 필요",
    "작성됨",
    "작성됨",
    "검토 필요",
    "작성됨",
  ]);
  const claimIds = plan.sections.flatMap((section) => section.claimIds);
  expect(new Set(claimIds).size).toBe(claimIds.length);
  for (const claimId of claimIds) {
    const claim = report.claims.find((item) => item.id === claimId);
    expect(claim?.status).toBe("published");
    expect(claim?.evidenceIds.length).toBeGreaterThan(0);
    expect(whyIds).not.toContain(claimId);
  }
  expect(
    harness.calls
      .filter((call) => !isReplyCall(call))
      .slice(before)
      .map((call) => call.url.pathname),
  ).toEqual(["/v1/plans"]);
  expect(
    events.filter((event) =>
      ["claim", "evidence", "gate", "forecast"].includes(event.event),
    ),
  ).toEqual([]);
  expect(withoutReplyEvents(events).at(-2)).toMatchObject({
    event: "suggest",
    data: {
      actions: [
        {
          id: "plan-docx",
          label: "계획 초안 docx 받기",
          href: `/api/plans/${planId}/export.docx`,
        },
      ],
    },
  });
  expect(
    withoutReplyEvents(events)
      .filter((event) => event.event === "agent_step")
      .at(-1)?.data,
  ).toMatchObject({
    agentId: "plan-writer",
    usedLlm: false,
    outputClaimIds: [],
    note: "초안 9섹션 중 6섹션을 발행 문장으로 채웠어요, 3섹션은 검토 필요",
  });
  expect(harness.snapshots.get(forecastId)).toEqual(report);
});

// 서버가 가진 첫 초안의 시각과 본문을 바꾸지 않고 409 뒤 조회로 확인한다
it("두 번째 요청은 같은 계획을 409 뒤 조회하고 기존 예보 id를 유지한다", async () => {
  const harness = planRecordsFixture();
  const { id, forecastId } = await harness.publish();
  const first = await harness.message(id, { text: "계획 초안 만들어 줘" });
  validFollowup(first, forecastId);
  const saved = structuredClone([...harness.plans.values()][0]);
  const before = harness.calls.filter((call) => !isReplyCall(call)).length;
  const second = await harness.message(id, { text: "계획 초안 만들어 줘" });
  validFollowup(second, forecastId);
  expect(
    harness.calls
      .filter((call) => !isReplyCall(call))
      .slice(before)
      .map((call) => call.url.pathname),
  ).toEqual(["/v1/plans", `/v1/plans/${saved.id}`]);
  expect(harness.plans.size).toBe(1);
  expect(harness.plans.get(saved.id)).toEqual(saved);
  expect(withoutReplyEvents(second).at(-2)?.data).toEqual(
    withoutReplyEvents(first).at(-2)?.data,
  );
});

// 가짜 records도 무효 본문·섹션 순서·스냅샷 밖 문장·잠금 값은 실제처럼 422로 거부한다
it.each(["body", "order", "claim", "locked", "unpublished"])(
  "records 검증 %s 실패는 이유를 로그에 남기고 링크를 보내지 않는다",
  async (invalid) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const harness = planRecordsFixture({
      override: async (call) => {
        if (call.url.pathname !== "/v1/plans") return;
        const plan = call.body as Plan;
        if (invalid === "body") plan.sections[0].body += " ";
        if (invalid === "order")
          [plan.sections[0], plan.sections[1]] = [
            plan.sections[1],
            plan.sections[0],
          ];
        if (invalid === "claim")
          plan.sections[0].claimIds = ["c-why-outside-snapshot"];
        if (invalid === "locked")
          plan.sections[2].lockedFields[0].value = "1 명";
        if (invalid === "unpublished") {
          const report = harness.snapshots.get(plan.forecastId);
          if (report) Object.assign(report.claims[0], { status: "candidate" });
        }
        return undefined;
      },
    });
    const { id, forecastId } = await harness.publish();
    const events = await harness.message(id, { text: "계획 초안 만들어 줘" });
    validFollowup(events, forecastId);
    expect(withoutReplyEvents(events).at(-2)).toMatchObject({
      event: "error",
      data: {
        code: "SERVICE_UNAVAILABLE",
        message: "계획 초안을 저장하지 못했어요",
      },
    });
    expect(warn).toHaveBeenCalledWith("계획 초안 저장 실패", {
      status: 422,
      reason: expect.any(String),
    });
    expect(events.some((event) => event.event === "suggest")).toBe(false);
    expect(harness.plans.size).toBe(0);
  },
);

// 동일 id 조회라도 다른 예보 범위의 응답을 받으면 다운로드 링크를 발행하지 않는다
it("409 뒤 조회 범위가 다르면 저장 실패로 안내한다", async () => {
  let different = false;
  const harness = planRecordsFixture({
    override: async ({ url }) => {
      if (different && url.pathname.startsWith("/v1/plans/")) {
        const plan = [...harness.plans.values()][0];
        return Response.json({ ...plan, forecastId: "f-sorae-2026" });
      }
    },
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const { id, forecastId } = await harness.publish();
  await harness.message(id, { text: "계획 초안 만들어 줘" });
  different = true;
  const events = await harness.message(id, { text: "계획 초안 만들어 줘" });
  validFollowup(events, forecastId);
  expect(withoutReplyEvents(events).at(-2)?.data).toMatchObject({
    code: "SERVICE_UNAVAILABLE",
  });
});

// 최초 스냅샷 저장 실패를 새 계획이나 후속 문장으로 덮지 않는다
it("records에 스냅샷이 없으면 422 안내를 돌려준다", async () => {
  const harness = planRecordsFixture();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const { id, forecastId } = await harness.publish();
  harness.snapshots.clear();
  const events = await harness.message(id, { text: "계획 초안 만들어 줘" });
  validFollowup(events, forecastId);
  expect(withoutReplyEvents(events).at(-2)?.data).toMatchObject({
    code: "SERVICE_UNAVAILABLE",
  });
  expect(harness.plans.size).toBe(0);
});

// 새 상담과 되묻기 대기 중에도 단독 초안 요청은 분석이나 저장을 시작하지 않는다
it.each([false, true])(
  "발행 전 초안 요청은 안내만 보낸다: 기존 상담 %s",
  async (existing) => {
    const harness = teamFixture();
    const id = existing ? await harness.prepare() : await harness.create();
    const before = harness.calls.filter((call) => !isReplyCall(call)).length;
    const events = await harness.message(id, { text: "계획 초안 만들어 줘" });
    validSequence(events);
    expect(withoutReplyEvents(events)).toMatchObject([
      {
        event: "error",
        data: {
          code: "OUT_OF_SCOPE",
          message: "먼저 예보를 받아야 계획 초안을 만들 수 있어요",
        },
      },
      { event: "done", data: { forecastId: null } },
    ]);
    expect(
      harness.calls.filter((call) => !isReplyCall(call)).slice(before),
    ).toEqual([]);
  },
);
