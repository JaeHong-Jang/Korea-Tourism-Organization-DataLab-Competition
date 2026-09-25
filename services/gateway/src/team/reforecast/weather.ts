// 예보 근거의 기상청 데이터셋으로 날씨 보정 여부와 미적용 사유를 표시한다
import type {
  ForecastReport,
  ReforecastResult,
} from "@crowdcast/contracts/types";
import { koreanToday } from "../analysis/as-of.js";

const weatherDatasets = new Set([
  "ds-kma-short-15084084",
  "ds-kma-mid-15059468",
]);

// 게이트를 통과한 새 예보 근거만 읽고 날씨 효과나 예측값을 계산하지 않는다
export function reforecastWeather(
  report: ForecastReport,
  today: string,
): ReforecastResult["weather"] {
  const evidenceIds = [
    ...new Set(
      report.forecast.evidence
        .filter(
          (item) =>
            ["data", "assumption"].includes(item.kind) &&
            item.source !== null &&
            weatherDatasets.has(item.source.datasetId),
        )
        .map((item) => item.id),
    ),
  ];
  if (evidenceIds.length)
    return {
      applied: true,
      evidenceIds,
      note: "기상청 예보 근거의 날씨 보정을 적용했어요.",
    };

  // 날씨 근거가 없으면 확인 가능한 날짜 범위만 확정하고 표본 사유는 추측하지 않는다
  const days =
    (Date.parse(koreanToday(new Date(report.event.startsAt))) -
      Date.parse(today)) /
    86_400_000;
  const note =
    days < 0
      ? "지난 행사여서 날씨 보정을 적용하지 않았어요."
      : days > 10
        ? "행사일이 기상청 예보 범위(10일) 밖이에요."
        : "날씨 없음 또는 보정 표본 부족으로 날씨 보정 근거가 없어요.";
  return { applied: false, evidenceIds: [], note };
}
