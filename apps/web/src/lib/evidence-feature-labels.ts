// 예보 입력 관측 항목의 내부 이름을 화면에서 읽기 쉬운 이름으로 바꾼다.
import type { Evidence } from "@crowdcast/contracts/types";

export const featureLabels: Record<string, string> = {
  previous_daily_mean: "직전 개최의 일평균 방문객",
  region_daily_mean: "평시 지역 방문자 수",
  nonlocal_share: "외지인 비율",
  weekend_ratio: "주말 방문 비율",
  log_budget: "행사 예산",
  duration: "개최 기간",
  weekend_days: "주말 일수",
  holiday_days: "공휴일 일수",
  holiday_streak: "연휴 길이",
  month: "개최 월",
  edition: "개최 회차",
};

// 발행 원문 제목은 보존하면서 알려진 관측 항목만 사람이 읽는 제목으로 표시한다.
export function evidenceDisplayTitle(evidence: Evidence, featureName?: string) {
  if (evidence.kind !== "data") return evidence.title;
  const name =
    featureName ?? /^예측 입력 관측: ([a-z_]+)$/.exec(evidence.title)?.[1];
  return name && featureLabels[name]
    ? `관측 자료 · ${featureLabels[name]}`
    : evidence.title;
}
