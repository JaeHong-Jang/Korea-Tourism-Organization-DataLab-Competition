// 계획 초안을 계약으로 검사하고 생성·조회·저장 경로에 연결한다.
import type { ForecastReport, Plan } from "@crowdcast/contracts/types";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { getForecastReport } from "../../lib/api-client";

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const schemas = import.meta.glob(
  "../../../../../packages/contracts/schemas/*.schema.json",
  { eager: true, import: "default" },
);
for (const schema of Object.values(schemas)) ajv.addSchema(schema as object);
const validatePlan = ajv.getSchema(
  "https://crowdcast.local/schemas/plan.schema.json",
);

// 응답 구조가 다르면 메모를 덮어쓰지 않도록 오류로 돌린다.
function planFrom(value: unknown): Plan {
  if (!validatePlan?.(value)) throw new Error("계획 초안 계약이 맞지 않아요.");
  return value as Plan;
}

// 본문과 근거가 스냅샷에서 끊기면 발행 문장을 화면에 내보내지 않는다.
function assertPublishedContent(plan: Plan, report: ForecastReport) {
  const claims = new Map(report.claims.map((claim) => [claim.id, claim]));
  const evidence = new Set(report.evidence.map((item) => item.id));
  for (const section of plan.sections) {
    const rendered: string[] = [];
    for (const id of section.claimIds) {
      const claim = claims.get(id);
      if (
        claim?.status !== "published" ||
        typeof claim.rendered !== "string" ||
        !claim.evidenceIds.length ||
        claim.evidenceIds.some((evidenceId) => !evidence.has(evidenceId))
      )
        throw new Error(
          `섹션 ${section.title}의 발행 근거를 확인할 수 없어요.`,
        );
      rendered.push(claim.rendered);
    }
    if (rendered.join("\n") !== section.body)
      throw new Error(`섹션 ${section.title}의 발행 문장이 스냅샷과 달라요.`);
  }
}

// 발행 스냅샷으로 초안을 만들고 저장된 최신 본문과 근거를 받는다.
export async function loadPlan(forecastId: string, signal: AbortSignal) {
  const id = encodeURIComponent(forecastId);
  const created = await fetch(`/api/forecasts/${id}/plan`, {
    method: "POST",
    signal,
  });
  if (!created.ok)
    throw new Error(`계획 초안을 준비하지 못했어요. (${created.status})`);
  const createdValue: unknown = await created.json();
  if (
    !createdValue ||
    typeof createdValue !== "object" ||
    !("plan" in createdValue)
  )
    throw new Error("계획 초안 응답 형식이 맞지 않아요.");
  const planId = planFrom(createdValue.plan).id;
  const response = await fetch(`/api/plans/${encodeURIComponent(planId)}`, {
    signal,
  });
  if (!response.ok)
    throw new Error(`저장된 초안을 열지 못했어요. (${response.status})`);
  const [value, report] = await Promise.all([
    response.json() as Promise<unknown>,
    getForecastReport(forecastId, signal),
  ]);
  const plan = planFrom(value);
  if (plan.forecastId !== report.forecastId)
    throw new Error("초안과 예보서가 서로 달라요.");
  assertPublishedContent(plan, report);
  return { plan, report: report as ForecastReport };
}

// 전체 계약 객체를 보내되 서버는 notes만 반영한다.
export async function savePlan(plan: Plan): Promise<Plan> {
  const response = await fetch(
    `/api/records/plans/${encodeURIComponent(plan.id)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(plan),
    },
  );
  if (!response.ok)
    throw new Error(`메모를 저장하지 못했어요. (${response.status})`);
  return planFrom(await response.json());
}
