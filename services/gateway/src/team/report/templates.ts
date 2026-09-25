// 결정적 예보의 판정·수치·요인·점검 항목을 근거가 붙은 문장으로 옮긴다
import type { Forecast } from "@crowdcast/contracts/types";
import {
  MODEL_NOTICE,
  REVIEW_NOTICE,
  reviewEvidence,
} from "../verification/skeptic.js";
import { type DraftText, draftClaims } from "./bundle.js";

// 판정의 문구와 법정·자체 구분은 예측 서비스가 반환한 정본을 그대로 쓴다
export function fixedTexts(forecast: Forecast): DraftText[] {
  const reviewIds = forecast.ood
    ? reviewEvidence(forecast).map((item) => item.id)
    : [];
  const texts: DraftText[] = forecast.judgment.reasons.map((reason) => ({
    text: String(reason.text),
    claimType: "판정",
    placeholders: [],
    evidenceIds: [...new Set([String(reason.evidenceId), ...reviewIds])],
  }));

  // 체크리스트 문구도 LLM이 고치지 않고 같은 참고용 근거를 함께 인용한다
  for (const item of forecast.judgment.checklist) {
    texts.push({
      text: item.text,
      claimType: "권고",
      placeholders: [],
      evidenceIds: [...new Set([...item.evidenceIds, ...reviewIds])],
    });
  }

  // 참고용·미검증 모델 고지도 검증과 발행을 거치는 별도 문장으로 만든다
  if (forecast.ood)
    texts.push({
      text: REVIEW_NOTICE,
      claimType: "설명",
      placeholders: [],
      evidenceIds: reviewIds,
    });
  if (forecast.predictionRun.modelVerdict === "미검증")
    texts.push({
      text: MODEL_NOTICE,
      claimType: "설명",
      placeholders: [],
      evidenceIds: forecast.evidence
        .filter(
          (item) => item.kind === "model" && item.forecastId === forecast.id,
        )
        .map((item) => item.id),
    });
  return texts;
}

// 구간 양끝은 Quantity에만 묶고 계약이 없는 표시 확률은 생성하지 않는다(LLM 경로도 이 문장을 그대로 쓴다)
export function peakText(forecast: Forecast): DraftText {
  const peak = forecast.peakConcurrent;
  return {
    text: `순간 최대 {{peak_p10}}~{{peak_p90}}명 추정 — 추정 산식 기반${forecast.judgment.basis === "구간" ? " · 표본 한계로 구간 기준 표시" : ""}`,
    claimType: "수치",
    evidenceIds: forecast.evidence
      .filter((item) => item.quantityIds.includes(peak.id))
      .map((item) => item.id),
    placeholders: [
      { name: "peak_p10", quantityId: peak.id, field: "p10" },
      { name: "peak_p90", quantityId: peak.id, field: "p90" },
    ],
  };
}

// 요인은 기여도 순으로 상위 세 개만 고르고 크기나 새로운 설명을 계산하지 않는다
export function topFactors(forecast: Forecast) {
  return [...forecast.factors]
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 3);
}

// LLM이 실패해도 수치·상위 요인을 고정 문장과 함께 같은 검사로 보낸다
export function templateTexts(forecast: Forecast): DraftText[] {
  const texts = [...fixedTexts(forecast), peakText(forecast)];
  for (const factor of topFactors(forecast)) {
    texts.push({
      text: factor.label,
      claimType: "요인",
      placeholders: [],
      evidenceIds: [...factor.evidenceIds],
    });
  }
  return texts;
}

// 템플릿도 draft부터 같은 게이트를 지나야 발행할 수 있다
export function templateClaims(forecast: Forecast, sessionId: string) {
  return draftClaims(templateTexts(forecast), sessionId, forecast.id);
}
