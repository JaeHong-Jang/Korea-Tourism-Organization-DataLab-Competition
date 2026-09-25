// 필터된 행사 중앙값을 시군구별로 더해 데이터 타일의 다섯 단계를 정한다.
import type { FestivalSummary } from "@crowdcast/contracts/types";

// 한 시군구의 여러 행사만 합산하고 예보 없는 지역은 지도에서 따로 둔다.
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

// 필터별 최대값을 정수 구간으로 나눠 색 단계와 범례가 같은 경계를 쓰게 한다.
export function tileRanges(
  maximum: number,
): Array<{ step: number; min: number; max: number }> {
  const ceiling = Math.max(5, Math.ceil(maximum));
  return Array.from({ length: 5 }, (_, index) => ({
    step: index + 1,
    min: index === 0 ? 0 : Math.floor((ceiling * index) / 5) + 1,
    max: Math.floor((ceiling * (index + 1)) / 5),
  }));
}

// 값이 없는 지역만 0단계로 분리하고 예보값 0은 첫 구간에 둔다.
export function tileStep(value: number | null, maximum: number): number {
  if (value === null) return 0;
  if (value <= 0) return 1;
  const ceiling = Math.max(5, Math.ceil(maximum));
  return Math.min(5, Math.max(1, Math.ceil((value / ceiling) * 5)));
}
