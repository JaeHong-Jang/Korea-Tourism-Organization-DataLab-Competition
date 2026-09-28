// 예보 식별자와 단위·구간을 검증해 하루 방문객과 동시 인원을 섞지 않는다.
import type { Insight } from "@crowdcast/contracts/types";
import { insightEvidence } from "./insight-data";

export type PeopleRange = {
  p10: number;
  p50: number;
  p90: number;
  unit: string;
};
export type ForecastPeople = {
  forecastId: string;
  eventId: string;
  name: string;
  start: string;
  end: string;
  dailyMean: PeopleRange;
  dailyScaleGrade?: number;
  peakConcurrent: PeopleRange;
};

// 영값을 보존하며 표본 일부가 누락되거나 단위가 바뀐 응답은 표시하지 않는다.
export function forecastPeople(insight: Insight): ForecastPeople[] | null {
  const evidence = insightEvidence(insight).find(
    (row) => "forecastPeople" in row,
  );
  const rows = evidence?.forecastPeople;
  const ids = evidence?.forecastIds;
  if (
    !Array.isArray(rows) ||
    !Array.isArray(ids) ||
    rows.length !== insight.sampleSize ||
    ids.length !== rows.length ||
    new Set(ids).size !== ids.length
  )
    return null;
  const seen = new Set<string>();
  for (const row of rows) {
    if (
      !row ||
      typeof row !== "object" ||
      typeof row.name !== "string" ||
      typeof row.forecastId !== "string" ||
      typeof row.eventId !== "string" ||
      typeof row.start !== "string" ||
      typeof row.end !== "string" ||
      !ids.includes(row.forecastId) ||
      seen.has(row.forecastId)
    )
      return null;
    seen.add(row.forecastId);
    for (const [key, unit] of [
      ["dailyMean", "명/일"],
      ["peakConcurrent", "명"],
    ]) {
      const q = row[key];
      if (
        !q ||
        q.unit !== unit ||
        [q.p10, q.p50, q.p90].some(
          (n) => typeof n !== "number" || !Number.isFinite(n) || n < 0,
        ) ||
        q.p10 > q.p50 ||
        q.p50 > q.p90
      )
        return null;
    }
  }
  return rows as ForecastPeople[];
}
