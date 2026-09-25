// 필터된 행사 중앙값을 시군구별로 더해 데이터 타일의 다섯 단계를 정한다.
import type { FestivalSummary } from "@crowdcast/contracts/types";

// 한 시군구의 여러 행사만 합산하며 값이 없는 지역은 첫 단계로 둔다.
export function sigunguPeaks(
  festivals: FestivalSummary[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const festival of festivals) {
    totals.set(
      festival.sigunguCode,
      (totals.get(festival.sigunguCode) ?? 0) + festival.peakP50,
    );
  }
  return totals;
}

// 현재 필터에서 가장 큰 합계를 기준으로 순차 색과 높이를 함께 정한다.
export function tileStep(value: number, maximum: number): number {
  return maximum > 0 && value > 0
    ? Math.max(1, Math.ceil((value / maximum) * 5))
    : 1;
}
