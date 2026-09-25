// 기준 그래프의 우천 점검 규칙·날씨 보정 가정을 수치 없는 근거로 연결한다
import type { Claim, Evidence, Forecast } from "@crowdcast/contracts/types";

export const WEATHER_RULE_TEXT =
  "비나 눈이 오면 대피 공간과 이동 동선을 확인해 주세요 — 참고용 — 담당자 검토 필수";
export const WEATHER_ASSUMPTION_TEXT =
  "과거 강수일 자료가 없으면 날씨에 따른 인원 보정은 적용하지 않아요 — 추정 산식 기반";

// 계수·표본·날씨 관측은 만들지 않고 기준 그래프의 식별자만 가리킨다
export function weatherEvidence(): Evidence[] {
  const base = {
    quantityIds: [],
    period: null,
    source: null,
    availableAt: null,
    ruleId: null,
    clauseId: null,
    caseEventId: null,
    assumptionId: null,
    forecastId: null,
    modelVersion: null,
    checkResult: null,
  };
  return [
    {
      ...base,
      id: "ev-whatif-rain-shelter",
      kind: "rule",
      ruleId: "rule-check-rain-shelter",
      title: "우천 시 대피 공간",
      summary: WEATHER_RULE_TEXT,
    },
    {
      ...base,
      id: "ev-whatif-weather-assumption",
      kind: "assumption",
      assumptionId: "as-weather-adjustment",
      title: "날씨 보정 가정",
      summary: WEATHER_ASSUMPTION_TEXT,
    },
  ];
}

// 일반 규칙 대조는 유지하고 우천 가정 질문의 고정 권고만 정본 참조로 허용한다
export function isWeatherRecommendation(claim: Claim, forecast: Forecast) {
  return (
    claim.claimType === "권고" &&
    claim.text === WEATHER_RULE_TEXT &&
    forecast.evidence.some(
      (item) =>
        item.kind === "rule" &&
        item.ruleId === "rule-check-rain-shelter" &&
        claim.evidenceIds.includes(item.id),
    )
  );
}
