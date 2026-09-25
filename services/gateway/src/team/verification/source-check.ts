// 문장 근거와 작성 단계의 로컬 참조를 확인하고 SHACL 검사 결과를 연결한다
import type { Claim, Forecast } from "@crowdcast/contracts/types";
import type { CheckInput, CheckResult } from "../report/bundle.js";
import type { Agent } from "../runtime/agent.js";

// 적재가 거부될 끊긴 참조는 그래프를 쓰기 전에 확인한다
export function hasKnownReferences(claim: Claim, forecast: Forecast) {
  return (
    claim.evidenceIds.every((id) =>
      forecast.evidence.some((item) => item.id === id),
    ) &&
    claim.placeholders.every((binding) =>
      [forecast.dailyMean, forecast.peakConcurrent].some(
        (quantity) =>
          quantity.id === binding.quantityId &&
          quantity[binding.field] !== null,
      ),
    )
  );
}

// S01·S11은 최종 knowledge 검사에서도 다시 확인한다
export const sourceCheck: Agent<CheckInput, CheckResult[]> = {
  id: "source-check",
  team: "verification",
  usesLlm: false,
  budgetMs: 1_000,
  // 초안마다 근거와 실제 작성 단계의 참조를 확인한다
  async run({ input, sessionId }) {
    return {
      value: input.claims.map((claim) => ({
        passed:
          claim.evidenceIds.length > 0 &&
          hasKnownReferences(claim, input.forecast) &&
          claim.sessionId === sessionId &&
          claim.forecastId === input.forecast.id &&
          claim.generatedBy.agentId === "explainer" &&
          claim.generatedBy.stepId !== "st-pending",
      })),
      note: "문장의 근거와 작성 단계를 확인했어요.",
    };
  },
};
