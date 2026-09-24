// 행사 목록의 위험 순과 날짜 순을 원본 변경 없이 계산한다.
import type { FestivalSummary } from "@crowdcast/contracts/types";

export type FestivalSort = "risk" | "date";

// 위험 순은 등급, 1천 명 초과 확률, 시작일 순으로 동률을 푼다.
export function sortFestivals(
  festivals: FestivalSummary[],
  sort: FestivalSort,
): FestivalSummary[] {
  return [...festivals].sort((a, b) => {
    if (sort === "risk") {
      const difference = b.level - a.level || b.pOver1000 - a.pOver1000;
      if (difference) return difference;
    }
    return (
      a.startsAt.localeCompare(b.startsAt) || a.eventId.localeCompare(b.eventId)
    );
  });
}
