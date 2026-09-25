// 방문 조건을 추출하고 일괄 예보 원문을 날짜·순간 최대 인원 순으로 고른다
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { recommendationDates } from "./dates.js";
import { recommendationRegion } from "./regions.js";

export type Recommendation = {
  query: {
    text: string;
    type: FestivalSummary["type"] | null;
    sido: string | null;
    from: string;
    to: string;
  };
  items: { summary: FestivalSummary; reason: string }[];
  total: number;
  note: string;
};
const types: [FestivalSummary["type"], RegExp][] = [
  ["불꽃", /불꽃|폭죽/],
  ["공연", /공연|콘서트|음악/],
  ["꽃", /꽃|벚꽃|장미|국화/],
  ["먹거리", /먹거리|음식|푸드|미식/],
  ["전통", /전통|문화제|민속/],
  ["대학", /대학|대동제/],
];

// 불꽃에서 꽃을 중복 추출하지 않고 여러 유형은 내부 필터에서 모두 보존한다
export function recommendationConditions(
  text: string,
  today: string,
  festivals: FestivalSummary[],
  nearby = false,
) {
  const selected = types
    .filter(([type, pattern]) =>
      pattern.test(type === "꽃" ? text.replace(/불꽃/g, "") : text),
    )
    .map(([type]) => type);
  const region = nearby
    ? { sido: null, label: null, matches: () => true }
    : recommendationRegion(text, festivals);
  const sort = /덜\s*붐비|한적|조용/.test(text)
    ? "quiet"
    : /큰|유명한|유명/.test(text)
      ? "large"
      : "date";
  return {
    query: {
      text,
      type: selected.length === 1 ? selected[0] : null,
      sido: region.sido,
      ...recommendationDates(text, today),
    },
    selected,
    region,
    sort: nearby ? "distance" : sort,
  };
}

// 날짜를 KST로 비교하고 같은 날짜·인원에서는 행사 id로 순서를 고정한다
export function selectRecommendations(
  festivals: FestivalSummary[],
  conditions: ReturnType<typeof recommendationConditions>,
): Recommendation["items"] {
  const { query, selected, region, sort } = conditions;
  const matched = festivals.filter((item) => {
    const day = new Date(Date.parse(item.startsAt) + 9 * 3_600_000)
      .toISOString()
      .slice(0, 10);
    return (
      day >= query.from &&
      day <= query.to &&
      (!selected.length || selected.includes(item.type)) &&
      region.matches(item)
    );
  });
  matched.sort((left, right) => {
    const crowd =
      sort === "quiet"
        ? left.peakP50 - right.peakP50
        : sort === "large"
          ? right.peakP50 - left.peakP50
          : 0;
    return (
      crowd ||
      Date.parse(left.startsAt) - Date.parse(right.startsAt) ||
      left.eventId.localeCompare(right.eventId)
    );
  });
  const order =
    sort === "quiet"
      ? "순간 최대 인원이 적은 순"
      : sort === "large"
        ? "순간 최대 인원이 많은 순"
        : sort === "distance"
          ? ""
          : "가까운 날짜순";
  return matched.map((summary) => ({
    summary,
    reason: [
      selected.length ? `${summary.type} 유형 일치` : "",
      region.label ? `${region.label} 지역 일치` : "",
      "조회 기간 일치",
      order,
    ]
      .filter(Boolean)
      .join(" · "),
  }));
}
