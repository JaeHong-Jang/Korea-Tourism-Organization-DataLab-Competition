// 인사이트 근거의 예보 식별자와 현재 행사 목록을 대조해 다른 표본을 섞지 않는다.
import type { FestivalSummary, Insight } from "@crowdcast/contracts/types";
import {
  analysisDay,
  insightEvidence,
  levelDistribution,
} from "./insight-data";

// 중복·누락·기간·등급 분포가 모두 맞는 목록만 분석 대상 명단으로 사용한다.
export function matchInsightFestivals(
  insight: Insight,
  festivals: FestivalSummary[],
): FestivalSummary[] | null {
  const groups = insightEvidence(insight)
    .filter((item) => "forecastIds" in item)
    .map((item) => item.forecastIds);
  if (
    !groups.length ||
    groups.some(
      (group) =>
        !Array.isArray(group) || group.some((id) => typeof id !== "string"),
    )
  )
    return null;
  const ids = groups[0] as string[];
  const expected = new Set(ids);
  if (
    expected.size !== insight.sampleSize ||
    ids.length !== expected.size ||
    ids.length === 0
  )
    return null;
  if (
    groups.some(
      (group) =>
        (group as string[]).length !== ids.length ||
        new Set(group as string[]).size !== ids.length ||
        (group as string[]).some((id) => !expected.has(id)),
    )
  )
    return null;
  const matched = festivals.filter((festival) =>
    expected.has(festival.forecastId),
  );
  if (
    matched.length !== ids.length ||
    new Set(matched.map((row) => row.forecastId)).size !== ids.length ||
    new Set(matched.map((row) => row.eventId)).size !== ids.length
  )
    return null;
  const distribution = levelDistribution(insight, "model");
  if (
    !distribution ||
    distribution.some(
      (row, index) =>
        matched.filter((festival) => festival.level === index + 1).length !==
        row.value,
    )
  )
    return null;

  // 행사 날짜는 한국 시간으로 맞추고 분석 자료의 전체 기간과도 대조한다.
  const starts = matched.map((row) => analysisDay(row.startsAt)).sort();
  const ends = matched.map((row) => analysisDay(row.endsAt)).sort();
  if (starts[0] !== insight.period.from || ends.at(-1) !== insight.period.to)
    return null;
  return matched.sort(
    (a, b) =>
      a.startsAt.localeCompare(b.startsAt) ||
      a.name.localeCompare(b.name, "ko"),
  );
}
