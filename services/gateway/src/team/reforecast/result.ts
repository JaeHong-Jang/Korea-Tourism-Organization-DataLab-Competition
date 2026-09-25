// 두 발행 스냅샷의 원래 수치를 재계산 없이 비교 응답으로 옮긴다
import type {
  ForecastReport,
  ReforecastResult,
} from "@crowdcast/contracts/types";
import { reforecastWeather } from "./weather.js";

// 배열 순서에 의존하지 않고 발행 시각이 가장 최근인 스냅샷을 고른다
export function previousSnapshot(eventId: string, reports: ForecastReport[]) {
  let latest: ForecastReport | null = null;
  for (const report of reports) {
    if (
      report.event.id !== eventId ||
      report.forecast.eventId !== eventId ||
      report.forecastId !== report.forecast.id
    )
      throw new Error("행사 스냅샷 응답 계약 위반");
    if (
      !latest ||
      Date.parse(report.publishedAt) > Date.parse(latest.publishedAt)
    )
      latest = report;
  }
  return latest;
}

// 단위 외 메타데이터를 제외하고 분포의 세 값을 그대로 보존한다
function quantiles(
  quantity: Pick<ReforecastResult["dailyMean"]["after"], "p10" | "p50" | "p90">,
) {
  return { p10: quantity.p10, p50: quantity.p50, p90: quantity.p90 };
}

// 현재 값은 저장 완료 응답에서 읽어 화면과 불변 스냅샷이 일치하게 한다
export function reforecastResult(
  before: ForecastReport | null,
  after: ForecastReport,
  today: string,
): ReforecastResult {
  return {
    eventId: after.event.id,
    forecastId: after.forecastId,
    previousForecastId: before?.forecastId ?? null,
    publishedAt: after.publishedAt,
    level: {
      before: before?.forecast.judgment.level ?? null,
      after: after.forecast.judgment.level,
    },
    peakConcurrent: {
      before: before ? quantiles(before.forecast.peakConcurrent) : null,
      after: quantiles(after.forecast.peakConcurrent),
      unit: "명",
    },
    dailyMean: {
      before: before ? quantiles(before.forecast.dailyMean) : null,
      after: quantiles(after.forecast.dailyMean),
      unit: "명/일",
    },
    weather: reforecastWeather(after, today),
  };
}
