// 공개 수치 대조 자료를 확정 비교 비율과 구분해 응답 형식을 확인한다.
import type { Insight } from "@crowdcast/contracts/types";
import { insightEvidence } from "./insight-data";

type Quantity = {
  label: string;
  value: number;
  unit: "명" | "매";
  approximate: boolean;
};
export type PublicComparison = {
  id: string;
  eventId: string;
  year: number;
  eventName: string;
  periodLabel: string;
  status: "conditions_unverified";
  limitation: string;
  ratio: null;
  announced: Quantity;
  observed: Quantity;
  sources: {
    title: string;
    url?: string;
    file?: string;
    publishedAt?: string | null;
  }[];
};

// 수치·단위·출처가 깨지면 공개 자료를 실제 비교 결과처럼 표시하지 않는다.
export function publicComparisons(insight: Insight): PublicComparison[] {
  const rows = insightEvidence(insight).find(
    (row) => row.publicComparisons,
  )?.publicComparisons;
  if (!Array.isArray(rows)) return [];
  return rows.filter((row): row is PublicComparison => {
    if (!row || typeof row !== "object") return false;
    return (
      typeof row.id === "string" &&
      typeof row.eventId === "string" &&
      Number.isInteger(row.year) &&
      row.year >= 1 &&
      row.year <= Number(insight.computedAt.slice(0, 4)) &&
      typeof row.eventName === "string" &&
      typeof row.periodLabel === "string" &&
      row.status === "conditions_unverified" &&
      row.ratio === null &&
      typeof row.limitation === "string" &&
      [row.announced, row.observed].every(
        (value) =>
          value &&
          typeof value.label === "string" &&
          Number.isFinite(value.value) &&
          value.value >= 0 &&
          ["명", "매"].includes(value.unit) &&
          typeof value.approximate === "boolean",
      ) &&
      Array.isArray(row.sources) &&
      row.sources.length >= 2 &&
      row.sources.every(
        (source: PublicComparison["sources"][number]) =>
          source &&
          typeof source.title === "string" &&
          (typeof source.file === "string" ||
            (typeof source.url === "string" &&
              /^https:\/\/[^/]+/.test(source.url))),
      )
    );
  });
}
