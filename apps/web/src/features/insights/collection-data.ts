// 수집 목록의 상태별 합계와 실제 행이 일치할 때만 행사 탐색에 사용한다.
import type { Insight } from "@crowdcast/contracts/types";
import { insightEvidence } from "./insight-data";

export type CollectedQuantity = {
  value: number;
  unit: string;
  label: string;
  approximate?: boolean;
};
export type CollectionRow = {
  id: string;
  eventName: string;
  year: number;
  region: string;
  start: string | null;
  end: string | null;
  periodLabel?: string | null;
  dateBasis: string;
  recurrenceYears: number[];
  announced: CollectedQuantity | null;
  observed: CollectedQuantity | null;
  regional: CollectedQuantity | null;
  status: "both" | "announced" | "observed" | "missing";
  needsReview: boolean;
  directComparable: boolean;
  limitation: string;
  publicId: string | null;
  sources: string[];
  comparisonBasis?: {
    status: "unverified" | "schedule_daily";
    announcedDaily: CollectedQuantity | null;
    observedDaily: CollectedQuantity | null;
    days: number | null;
    observationPeriod: { from: string; to: string } | null;
    scope: string;
    note: string;
    formula: string | null;
    ratio: null;
  } | null;
};
export type CollectionYear = {
  year: number;
  registered: number;
  ended: number;
  dateMissing: number;
  notEnded: number;
  announced: number;
  observed: number;
  regional: number;
  needsReview: number;
  directComparable: number;
  statuses: Record<CollectionRow["status"], number>;
};
export type CollectionInventory = {
  version: number;
  asOf: string;
  years: CollectionYear[];
  rows: CollectionRow[];
  repeatedGroups: number;
  threeYearGroups: number;
  scope: string;
  reportSources?: { title: string; url: string }[];
};

// 부분적으로 깨진 목록을 전체 수집 통계인 것처럼 표시하지 않는다.
export function collectionData(insight: Insight): CollectionInventory | null {
  const raw = insightEvidence(insight).find(
    (row) => row.collectionInventory,
  )?.collectionInventory;
  if (!raw || typeof raw !== "object") return null;
  const value = raw as CollectionInventory;
  if (
    value.version !== 1 ||
    !Array.isArray(value.rows) ||
    !Array.isArray(value.years) ||
    typeof value.asOf !== "string" ||
    typeof value.scope !== "string"
  )
    return null;
  if (
    value.rows.some(
      (row) =>
        !row ||
        typeof row.id !== "string" ||
        typeof row.eventName !== "string" ||
        typeof row.region !== "string" ||
        !Number.isInteger(row.year) ||
        row.year < 1 ||
        row.year > Number(value.asOf.slice(0, 4)) ||
        !Array.isArray(row.recurrenceYears) ||
        !Array.isArray(row.sources) ||
        !["both", "announced", "observed", "missing"].includes(row.status) ||
        [row.announced, row.observed, row.regional].some(
          (q) =>
            q !== null &&
            (!q ||
              !Number.isFinite(q.value) ||
              typeof q.label !== "string" ||
              typeof q.unit !== "string"),
        ),
    )
  )
    return null;
  if (
    new Set(value.rows.map((row) => row.id)).size !== value.rows.length ||
    new Set(value.years.map((row) => row.year)).size !== value.years.length ||
    value.rows.some(
      (row) => !value.years.some((total) => total.year === row.year),
    )
  )
    return null;
  for (const total of value.years) {
    const year = total.year;
    const rows = value.rows.filter((row) => row.year === year);
    if (
      !Number.isInteger(year) ||
      year < 1 ||
      year > Number(value.asOf.slice(0, 4)) ||
      !total.statuses ||
      total.ended !== rows.length ||
      total.announced !== rows.filter((row) => row.announced !== null).length ||
      total.observed !== rows.filter((row) => row.observed !== null).length ||
      total.regional !== rows.filter((row) => row.regional !== null).length ||
      total.registered !== total.ended + total.dateMissing + total.notEnded ||
      (["both", "announced", "observed", "missing"] as const).some(
        (status) =>
          total.statuses[status] !==
          rows.filter((row) => row.status === status).length,
      )
    )
      return null;
  }
  return value;
}

export const COLLECTION_STATUS = {
  both: "양쪽 확보",
  announced: "발표만 확보",
  observed: "관측만 확보",
  missing: "추가 수집 필요",
};
