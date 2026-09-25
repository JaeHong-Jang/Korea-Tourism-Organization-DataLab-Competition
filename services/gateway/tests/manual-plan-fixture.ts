// 매뉴얼 정본 라벨로 인력·조직·수용인원 권고가 붙은 영종 예보 응답을 준비한다
import labels from "@crowdcast/contracts/jsonld/master-labels.json";
import type { Forecast } from "@crowdcast/contracts/types";

export const manualRules = [
  "rule-check-staff-plan",
  "rule-check-staff-distinct",
  "rule-check-staff-focus",
  "rule-check-org-chart",
  "rule-check-org-hq",
  "rule-check-capacity",
] as const;

// 쪽수는 근거 요약에만 두고 체크리스트 문장과 규칙 참조를 예보 응답 형태로 연결한다
export function withManualChecks(forecast: Forecast): Forecast {
  const base = forecast.evidence.find((item) => item.kind === "rule");
  if (!base) throw new Error("영종 규칙 근거 없음");
  for (const ruleId of manualRules) {
    const label = labels.rules[ruleId];
    const id = `ev-yeongjong-${ruleId}`;
    forecast.evidence.push({
      ...base,
      id,
      ruleId,
      clauseId: null,
      quantityIds: [],
      title: label.title,
      summary: `자체 기준 — ${label.title} 입력: {} 출처: ${label.source}`,
    });
    forecast.judgment.checklist.push({
      id: `ck-${ruleId.replace("rule-check-", "")}`,
      text: label.title,
      ruleId,
      evidenceIds: [id],
    });
  }
  return forecast;
}
