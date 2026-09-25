// 발행 묶음의 요인 라벨과 사례·평시·모델 근거로 숫자 없는 설명을 만든다
import type { Claim, ForecastReport } from "@crowdcast/contracts/types";
import type { Agent } from "../runtime/agent.js";
import {
  MODEL_NOTICE,
  REVIEW_NOTICE,
  reviewEvidence,
} from "../verification/skeptic.js";
import { type DraftText, draftClaims } from "./bundle.js";
import { topFactors } from "./templates.js";

// 근거가 있는 설명만 추가하고 요인은 예측 서비스의 라벨 그대로 사용한다
export function whyTexts(report: ForecastReport): DraftText[] {
  const forecast = report.forecast;
  const texts: DraftText[] = topFactors(forecast).map((factor) => ({
    text: factor.label,
    claimType: "요인",
    evidenceIds: [...factor.evidenceIds],
    placeholders: [],
  }));
  const modelIds = report.evidence
    .filter((item) => item.kind === "model" && item.forecastId === forecast.id)
    .map((item) => item.id);
  const explanations: [string, string[]][] = [
    [
      "비슷한 과거 행사 기록을 근거로 삼았어요",
      report.evidence
        .filter((item) => item.kind === "case")
        .map((item) => item.id),
    ],
    [
      "개최 지역의 평시 방문 자료를 함께 봤어요",
      (report.baseline?.evidence ?? [])
        .filter((item) => item.kind === "data")
        .map((item) => item.id),
    ],
    ["예측 모델이 추정한 범위를 따랐어요", modelIds],
  ];
  for (const [text, evidenceIds] of explanations)
    if (evidenceIds.length)
      texts.push({ text, claimType: "설명", evidenceIds, placeholders: [] });

  // 필수 고지는 근거가 없으면 같은 게이트가 거부하도록 빈 인용도 유지한다
  if (forecast.ood)
    texts.push({
      text: REVIEW_NOTICE,
      claimType: "설명",
      evidenceIds: reviewEvidence(forecast).map((item) => item.id),
      placeholders: [],
    });
  if (forecast.predictionRun.modelVerdict === "미검증")
    texts.push({
      text: MODEL_NOTICE,
      claimType: "설명",
      evidenceIds: modelIds,
      placeholders: [],
    });
  return texts;
}

export const whyExplainer: Agent<ForecastReport, Claim[]> = {
  id: "explainer",
  team: "report",
  usesLlm: false,
  budgetMs: 1_000,
  // 반복 질문도 새 문장 식별자로 생성해 발행된 문장을 수정하지 않는다
  async run({ input, sessionId }) {
    return {
      value: draftClaims(whyTexts(input), sessionId, input.forecastId),
      note: "발행된 예보의 근거로 설명을 준비했어요.",
    };
  },
};
