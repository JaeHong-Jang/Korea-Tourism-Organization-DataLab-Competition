// 가짜 records가 스냅샷 범위·섹션 순서·원문 연결·잠금 수치를 실제 저장 규칙으로 확인한다
import planSectionSchema from "@crowdcast/contracts/schemas/plan-section.schema.json";
import type { ForecastReport, Plan } from "@crowdcast/contracts/types";
import { querySchema } from "../src/clients/query-schemas.js";
import { followupFixture } from "./followup-fixture.js";

const validatePlan = querySchema<Plan>("plan");

// 작성 상태와 관계없이 모든 본문은 스냅샷의 발행 원문을 그대로 연결해야 한다
export function planProblem(
  value: unknown,
  report: ForecastReport | undefined,
) {
  if (!validatePlan(value)) return "plan: 계약 스키마 위반";
  if (
    !report ||
    value.forecastId !== report.forecastId ||
    value.sessionId !== report.sessionId ||
    value.eventId !== report.event.id
  )
    return "plan: 예보 스냅샷 범위가 다릅니다";
  const keys = planSectionSchema.properties.key.enum;
  for (const [position, section] of value.sections.entries()) {
    if (section.key !== keys[position]) return `섹션 ${section.key}: 순서 위반`;
    const claims = section.claimIds.map((id) =>
      report.claims.find((claim) => claim.id === id),
    );
    if (
      claims.some(
        (claim) =>
          !claim ||
          claim.status !== "published" ||
          claim.sessionId !== report.sessionId ||
          claim.forecastId !== report.forecastId,
      )
    )
      return `섹션 ${section.key}: 스냅샷의 발행 문장만 넣을 수 있습니다`;
    if (section.body !== claims.map((claim) => claim?.rendered).join("\n"))
      return `섹션 ${section.key}: body는 rendered 연결이어야 합니다`;
    for (const field of section.lockedFields) {
      const quantity = [
        report.forecast.dailyMean,
        report.forecast.peakConcurrent,
      ].find((item) => item.id === field.quantityId);
      const number = quantity?.[field.name];
      if (
        !quantity ||
        typeof number !== "number" ||
        field.value !== `${JSON.stringify(number)} ${quantity.unit}`
      )
        return `섹션 ${section.key}: 잠금 수치와 정규 표기가 다릅니다`;
    }
  }
  return null;
}

// 같은 계획 id는 충돌로 돌려주고 조회는 이미 저장한 객체를 그대로 반환한다
export function planRecordsFixture(
  options: Parameters<typeof followupFixture>[0] = {},
) {
  const plans = new Map<string, Plan>();
  let snapshots = new Map<string, ForecastReport>();
  const harness = followupFixture({
    ...options,
    override: async (call) => {
      const override = await options.override?.(call);
      if (override) return override;
      if (call.url.pathname === "/v1/plans" && call.body) {
        const value = call.body as Plan;
        const problem = planProblem(value, snapshots.get(value.forecastId));
        if (problem)
          return Response.json(
            { error: "invalid_plan", message: problem },
            { status: 422 },
          );
        if (plans.has(value.id)) return new Response(null, { status: 409 });
        const plan = {
          ...structuredClone(value),
          createdAt: "2026-09-25T12:00:00+09:00",
          updatedAt: "2026-09-25T12:00:00+09:00",
        };
        plans.set(plan.id, plan);
        return Response.json(plan);
      }
      if (call.url.pathname.startsWith("/v1/plans/")) {
        const plan = plans.get(call.url.pathname.split("/").at(-1) ?? "");
        return plan ? Response.json(plan) : new Response(null, { status: 404 });
      }
    },
  });
  snapshots = harness.snapshots;
  return { ...harness, plans };
}
