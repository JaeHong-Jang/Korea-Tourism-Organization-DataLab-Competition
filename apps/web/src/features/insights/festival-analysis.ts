// 같은 행사 표본으로 필터와 시작 월·지역·유형·예상 규모의 건수를 계산한다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { analysisDay } from "./insight-data";

export type FestivalFilters = {
  month: string;
  region: string;
  type: string;
  query: string;
};

// 월을 넘기는 행사도 시작 월에 한 번만 집계한다.
export function startMonth(row: FestivalSummary): string {
  return analysisDay(row.startsAt).slice(0, 7);
}

// 모든 그래프와 목록이 같은 조건을 사용하도록 필터를 공유한다.
export function filterFestivals(
  rows: FestivalSummary[],
  filters: FestivalFilters,
) {
  return rows.filter(
    (row) =>
      (!filters.month || startMonth(row) === filters.month) &&
      (!filters.region || row.sigunguCode === filters.region) &&
      (!filters.type || row.type === filters.type) &&
      `${row.name} ${row.sigunguName}`
        .toLocaleLowerCase("ko-KR")
        .includes(filters.query.trim().toLocaleLowerCase("ko-KR")),
  );
}

// 전체 표본을 빠짐없이 세고 긴 지역 목록의 나머지도 건수로 보존한다.
export function countFestivals(
  rows: FestivalSummary[],
  key: (row: FestivalSummary) => string,
  limit?: number,
) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = key(row);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const result = [...counts]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "ko"));
  if (!limit || result.length <= limit) return result;
  return [
    ...result.slice(0, limit),
    {
      label: "그 외 지역",
      value: result.slice(limit).reduce((sum, row) => sum + row.value, 0),
    },
  ];
}

// 예상 동시 인원을 숫자 구간으로 나누며 서비스 관리 등급은 재판정하지 않는다.
export function peakDistribution(rows: FestivalSummary[]) {
  return [
    {
      label: "1천 명 미만",
      value: rows.filter((row) => row.peakP50 < 1000).length,
    },
    {
      label: "1천~5천 명 미만",
      value: rows.filter((row) => row.peakP50 >= 1000 && row.peakP50 < 5000).length,
    },
    {
      label: "5천~1만 명 미만",
      value: rows.filter((row) => row.peakP50 >= 5000 && row.peakP50 < 10000).length,
    },
    {
      label: "1만~2만 명 미만",
      value: rows.filter((row) => row.peakP50 >= 10000 && row.peakP50 < 20000).length,
    },
    {
      label: "2만 명 이상",
      value: rows.filter((row) => row.peakP50 >= 20000).length,
    },
  ];
}
