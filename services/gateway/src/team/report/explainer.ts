// 해설가 호출이 실패하면 같은 검증 경로를 타는 템플릿 초안을 반환한다
import type { Claim, Forecast } from "@crowdcast/contracts/types";
import {
  type ExplanationFailure,
  explanationFailure,
} from "../../llm/explanation-failure.js";
import {
  EXPLANATION_PROMPT,
  explanationInput,
} from "../../llm/explanation-prompt.js";
import {
  ollamaExplanationSchema,
  validateExplanation,
} from "../../llm/explanation-schema.js";
import type { Agent } from "../runtime/agent.js";
import { draftClaims } from "./bundle.js";
import {
  fixedTexts,
  peakText,
  templateClaims,
  topFactors,
} from "./templates.js";

export type ExplanationInput = {
  forecast: Forecast;
  templateOnly: boolean;
  violations: string[];
  fallbackReason?: ExplanationFailure;
};
export type Explanation = { claims: Claim[]; template: boolean };

// LLM 문장은 요인 순서대로 하나씩, 그 요인의 라벨 그대로·그 요인 근거만 인용해야 받는다
function matchesFactors(
  claims: { text: string; evidenceIds: string[] }[],
  forecast: Forecast,
) {
  const factors = topFactors(forecast);
  return (
    claims.length === factors.length &&
    claims.every((claim, index) => {
      const factor = factors[index];
      return (
        claim.text === factor.label &&
        claim.evidenceIds.length > 0 &&
        claim.evidenceIds.every((id) => factor.evidenceIds.includes(id))
      );
    })
  );
}

// 시간 예산은 실행기가 나누고 호출 실패의 원문은 기록하지 않는다(적재된 4B 모델 요인 3문장 1.6~2.0초 — 9/25 측정, 첫 로딩 여유 포함)
export const explainer: Agent<ExplanationInput, Explanation> = {
  id: "explainer",
  team: "report",
  usesLlm: true,
  budgetMs: 8_000,
  // 설명할 요인이 없으면 호출하지 않고, 호출·스키마 실패는 템플릿 초안으로 되돌린다
  async run(ctx) {
    let reason = ctx.input.fallbackReason;
    const factors = topFactors(ctx.input.forecast);
    if (!ctx.input.templateOnly && factors.length === 0)
      return {
        value: {
          claims: templateClaims(ctx.input.forecast, ctx.sessionId),
          template: true,
        },
        note: "설명할 요인이 없어 템플릿 설명을 검증팀에 넘겨요.",
      };
    if (!ctx.input.templateOnly) {
      try {
        const result = await ctx.llm.complete({
          schema: ollamaExplanationSchema(
            factors.flatMap((item) => item.evidenceIds),
            factors.length,
          ),
          recordingKey: ctx.input.violations.length
            ? "explanation-rewrite"
            : "explanation",
          messages: [
            { role: "system", content: EXPLANATION_PROMPT },
            {
              role: "user",
              content: explanationInput(
                ctx.input.forecast,
                ctx.input.violations,
              ),
            },
          ],
        });
        const output: unknown = JSON.parse(result.content);
        if (
          validateExplanation(output) &&
          matchesFactors(output.claims, ctx.input.forecast)
        )
          return {
            value: {
              claims: draftClaims(
                [
                  ...fixedTexts(ctx.input.forecast),
                  peakText(ctx.input.forecast),
                  ...output.claims,
                ],
                ctx.sessionId,
                ctx.input.forecast.id,
              ),
              template: false,
            },
            note: "근거 묶음으로 설명 초안을 만들었어요.",
          };
        reason = "schema";
      } catch (error) {
        // 생성 실패는 템플릿으로 넘기되 요청 취소는 실행기가 그대로 중단한다
        reason = explanationFailure(error);
      }
    }
    return {
      value: {
        claims: templateClaims(ctx.input.forecast, ctx.sessionId),
        template: true,
      },
      note: `템플릿 설명을 검증팀에 넘겨요${reason ? `(${reason})` : ""}.`,
    };
  },
};
