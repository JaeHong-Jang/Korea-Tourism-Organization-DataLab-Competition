// 판정·권고 문구와 인용 규칙의 법정·자체 구분을 정본 응답에 대조한다
import type { Claim, Forecast } from "@crowdcast/contracts/types";
import type { CheckInput, CheckResult } from "../report/bundle.js";
import { claimLabel } from "../report/templates.js";
import type { Agent } from "../runtime/agent.js";
import { isWeatherRecommendation } from "../whatif/weather-evidence.js";
import { type AnalysisCheckInput, analysisCheck } from "./analysis-check.js";
import { checkNumbers } from "./number-check.js";

// 판정은 규칙 결과 문구와 인용 근거·조항이 모두 같은 경우에만 허용한다
export function matchesRule(claim: Claim, forecast: Forecast) {
  const rendered = checkNumbers(claim, forecast).rendered;
  // 규칙 문장을 설명으로 잘못 분류해 정본 대조를 건너뛰지 못하게 한다
  if (
    !["판정", "권고"].includes(claim.claimType) &&
    forecast.evidence.some(
      (item) => item.kind === "rule" && claim.evidenceIds.includes(item.id),
    )
  )
    return false;
  if (claim.claimType === "판정")
    return forecast.judgment.reasons.some((reason) => {
      const evidence = forecast.evidence.find(
        (item) => item.id === reason.evidenceId,
      );
      return (
        rendered === reason.text &&
        claim.evidenceIds.includes(String(reason.evidenceId)) &&
        evidence?.kind === "rule" &&
        evidence.ruleId === reason.ruleId &&
        (reason.kind === "법정"
          ? !!reason.clauseId && evidence.clauseId === reason.clauseId
          : reason.kind === "자체" &&
            reason.clauseId === null &&
            evidence.clauseId === null)
      );
    });
  if (claim.claimType === "권고")
    return (
      isWeatherRecommendation(claim, forecast) ||
      forecast.judgment.checklist.some(
        (item) =>
          rendered === item.text &&
          item.evidenceIds.every((id) => claim.evidenceIds.includes(id)),
      )
    );
  // 요인은 예측 서비스가 만든 라벨 그대로(또는 그 라벨에서 숫자 조각만 뺀 결정적 형태)만 허용한다
  // (풀어 쓴 문장은 뜻·부정·한글 수사를 검증할 수 없다)
  if (claim.claimType === "요인")
    return forecast.factors.some(
      (item) =>
        (rendered === item.label || rendered === claimLabel(item)) &&
        item.evidenceIds.every((id) => claim.evidenceIds.includes(id)),
    );
  return true;
}

// 판정·위험 점검을 누락한 문장 묶음도 불완전한 해설로 되돌린다
export const ruleCheck: Agent<CheckInput, CheckResult[]> = {
  id: "rule-check",
  team: "verification",
  usesLlm: false,
  budgetMs: 1_000,
  // 판정·권고 누락과 개별 문구 변조를 함께 검사한다
  async run({ input }) {
    const complete =
      input.forecast.judgment.reasons.every((reason) =>
        input.claims.some(
          (claim) =>
            claim.claimType === "판정" &&
            checkNumbers(claim, input.forecast).rendered === reason.text,
        ),
      ) &&
      input.forecast.judgment.checklist.every((item) =>
        input.claims.some(
          (claim) => claim.claimType === "권고" && claim.text === item.text,
        ),
      );
    return {
      value: input.claims.map((claim) => ({
        passed: complete && matchesRule(claim, input.forecast),
      })),
      note: "판정 문구와 법정·자체 기준을 대조했어요.",
    };
  },
};

// 게이트 A의 판정 규칙과 법정 조항 연결 검사를 법규담당 작업으로 기록한다
export const analysisRuleCheck: Agent<AnalysisCheckInput, null> = {
  ...ruleCheck,
  // 판정 규칙을 가리킨 근거에 담당 모양의 검사 결과를 연결한다
  async run({ input }) {
    return analysisCheck(
      input,
      ["S05", "S06"],
      input.evidence.filter((item) => item.kind === "rule"),
      "판정 규칙과 법정 조항 연결을 확인했어요.",
    );
  },
};
