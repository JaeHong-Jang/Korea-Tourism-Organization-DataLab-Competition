// 행사 계약 목록에 선택 스토어의 기간·시도·유형·등급 조건을 적용한다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import type { FestivalFilters } from "../selection-store";

export const sidoNames: Record<string, string> = {
  "11": "서울특별시",
  "26": "부산광역시",
  "27": "대구광역시",
  "28": "인천광역시",
  "29": "광주광역시",
  "30": "대전광역시",
  "31": "울산광역시",
  "36": "세종특별자치시",
  "41": "경기도",
  "43": "충청북도",
  "44": "충청남도",
  "46": "전라남도",
  "47": "경상북도",
  "48": "경상남도",
  "50": "제주특별자치도",
  "51": "강원특별자치도",
  "52": "전북특별자치도",
};

// 행정구역 명칭이 줄어든 API 응답에도 코드 기준 시도를 사용한다.
export function festivalSido(festival: FestivalSummary): string {
  return (
    sidoNames[festival.sigunguCode.slice(0, 2)] ??
    festival.sigunguName.split(" ")[0]
  );
}

// 날짜 입력과 견본 시각을 모두 한국 달력 날짜로 맞춘다.
export function koreanDay(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// 선택 기간은 시작일을 포함하고 종료일의 다음 날 직전까지 포함한다.
export function periodBounds(
  period: string | null,
  today: string,
): [string, string] | null {
  if (!period) return null;
  if (period.startsWith("custom:")) {
    const [, start, end] = period.split(":");
    return [start || "0000-01-01", end || "9999-12-31"];
  }
  const anchor = new Date(`${today}T12:00:00+09:00`);
  if (period === "week") {
    const weekday = (anchor.getUTCDay() + 6) % 7;
    anchor.setUTCDate(anchor.getUTCDate() - weekday);
  }
  const first = koreanDay(anchor);
  const days = period === "week" ? 6 : period === "two-weeks" ? 13 : 29;
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return [first, koreanDay(anchor)];
}

// 기간과 지역 등의 조합을 한 번만 적용해 목록·지도·KPI가 같은 자료를 쓴다.
export function filterFestivals(
  festivals: FestivalSummary[],
  filters: FestivalFilters,
  today: string,
): FestivalSummary[] {
  const bounds = periodBounds(filters.period, today);
  return festivals.filter((festival) => {
    const date = koreanDay(festival.startsAt);
    return (
      (!bounds || (date >= bounds[0] && date <= bounds[1])) &&
      (!filters.sido || festivalSido(festival) === filters.sido) &&
      (!filters.type || festival.type === filters.type) &&
      (!filters.level || festival.level === filters.level)
    );
  });
}
