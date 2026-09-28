// 방금 저장한 실측을 행사 전 마지막 예보의 범위와 맞대 본다.
import type { ForecastReport } from "@crowdcast/contracts/types";

export type ActualComparison =
  | { kind: "none" }
  | { kind: "scope"; forecastScope: string }
  | { kind: "missing" }
  | {
      kind: "ok";
      inRange: boolean;
      ratio: number;
      p10: number;
      p90: number;
      unit: string;
      publishedAt: string;
    };

// 행사 시작 전에 발행된 마지막 예보를 고르고, 그런 예보가 없으면 가장 최근 예보를 쓴다.
export function forecastBeforeEvent(
  snapshots: ForecastReport[],
  startsAt: string,
): ForecastReport | undefined {
  const before = snapshots.filter(
    (item) => Date.parse(item.publishedAt) <= Date.parse(startsAt),
  );
  return (before.length ? before : snapshots).at(-1);
}

// 공간 범위가 다르거나 예보 범위가 비어 있으면 비교하지 않는다.
export function compareActual(
  report: ForecastReport | undefined,
  metric: "daily" | "peak",
  value: number,
  scope: string,
): ActualComparison {
  if (!report) return { kind: "none" };
  const quantity =
    metric === "daily"
      ? report.forecast.dailyMean
      : report.forecast.peakConcurrent;
  if (quantity.spatialScope !== scope)
    return { kind: "scope", forecastScope: quantity.spatialScope };
  const { p10, p50, p90 } = quantity;
  if (p10 == null || p50 == null || p90 == null || p50 <= 0)
    return { kind: "missing" };
  return {
    kind: "ok",
    inRange: value >= p10 && value <= p90,
    ratio: (value - p50) / p50,
    p10,
    p90,
    unit: quantity.unit,
    publishedAt: report.publishedAt,
  };
}
