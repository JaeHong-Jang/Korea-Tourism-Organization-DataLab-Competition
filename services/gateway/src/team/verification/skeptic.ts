// 구간 표시와 OOD 참고용 인용 및 사용 모델 상태 고지를 확인한다
import type { Claim, Forecast } from "@crowdcast/contracts/types";
import type { CheckInput, CheckResult } from "../report/bundle.js";
import type { Agent } from "../runtime/agent.js";
import { type AnalysisCheckInput, analysisCheck } from "./analysis-check.js";

export const REVIEW_NOTICE = "참고용 — 담당자 검토 필수";
export const MODEL_NOTICE =
  "사례 재현 검증 전 임시 사용 모델로 만든 예보예요 — 참고용으로 봐 주세요";

// 다른 예보의 검사나 실패한 검사를 참고용 근거로 재사용하지 않는다
export function reviewEvidence(forecast: Forecast) {
  return forecast.evidence.filter(
    (item) =>
      item.kind === "check" &&
      item.forecastId === forecast.id &&
      item.checkResult?.passed &&
      ["ood", "uncertainty"].includes(item.checkResult.checkKind) &&
      item.title === REVIEW_NOTICE,
  );
}

// S10은 rejected에도 적용되므로 인용이 빠진 초안은 적재 전에 걸러 낸다
export function hasReviewCitation(claim: Claim, forecast: Forecast) {
  return (
    !forecast.ood ||
    !["판정", "권고"].includes(claim.claimType) ||
    reviewEvidence(forecast).some((item) => claim.evidenceIds.includes(item.id))
  );
}

// 미검증 모델의 고지는 같은 모델 근거를 인용한 고정 문장으로 확인한다
export function hasModelNotice(claims: Claim[], forecast: Forecast) {
  return (
    forecast.predictionRun.modelVerdict !== "미검증" ||
    claims.some(
      (claim) =>
        claim.text === MODEL_NOTICE &&
        forecast.evidence.some(
          (item) =>
            item.kind === "model" &&
            item.forecastId === forecast.id &&
            claim.evidenceIds.includes(item.id),
        ),
    )
  );
}

// 숫자가 없어도 확률 표기와 필수 고지 누락을 별도 검사로 남긴다
export const skeptic: Agent<CheckInput, CheckResult[]> = {
  id: "skeptic",
  team: "verification",
  usesLlm: false,
  budgetMs: 1_000,
  // 묶음의 필수 고지와 개별 문장의 표시 방식을 함께 확인한다
  async run({ input }) {
    const modelNotice = hasModelNotice(input.claims, input.forecast);
    const intervalNotice =
      input.forecast.judgment.basis !== "구간" ||
      input.claims.some((claim) =>
        claim.text.includes("표본 한계로 구간 기준 표시"),
      );
    return {
      value: input.claims.map((claim) => ({
        passed:
          modelNotice &&
          intervalNotice &&
          hasReviewCitation(claim, input.forecast) &&
          (!claim.placeholders.some(
            (binding) =>
              binding.quantityId === input.forecast.peakConcurrent.id,
          ) ||
            claim.text.includes("추정")) &&
          (input.forecast.judgment.basis !== "구간" ||
            !/[%％]|퍼센트/.test(claim.text)) &&
          (!input.forecast.ood ||
            input.claims.some(
              (item) =>
                item.text === REVIEW_NOTICE &&
                reviewEvidence(input.forecast).some((evidence) =>
                  item.evidenceIds.includes(evidence.id),
                ),
            )),
      })),
      note: "구간 표시와 참고용 고지를 확인했어요.",
    };
  },
};

// 게이트 A의 환산 가정과 기준일 이전 관측값 검사를 깐깐이 작업으로 기록한다
export const analysisSkeptic: Agent<AnalysisCheckInput, null> = {
  ...skeptic,
  // 가정과 예보 입력의 근거를 검사 기록에 남기고 새 수치를 계산하지 않는다
  async run({ input }) {
    return analysisCheck(
      input,
      ["S07", "S09"],
      input.evidence.filter((item) =>
        ["assumption", "data", "model"].includes(item.kind),
      ),
      "환산 가정과 공개 시점을 확인했어요.",
    );
  },
};
