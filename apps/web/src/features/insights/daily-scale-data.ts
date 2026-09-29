// 서버가 계산한 고정 규모 등급과 실제 예보 행의 일치 여부를 검증한다.
import type { Insight } from "@crowdcast/contracts/types";
import type { ForecastPeople } from "./forecast-people-data";
import { insightEvidence } from "./insight-data";

export type ScaleBand = {
  grade: number;
  lowerInclusive: number;
  upperExclusive: number | null;
  count: number;
};
export type DailyScale = {
  method: "fixed";
  basis: "dailyMean.p50";
  unit: "명/일";
  sampleSize: number;
  classCount: number;
  bands: ScaleBand[];
  note: string;
};

// 경계값은 다음 등급에 넣고 빈 구간도 정상 응답으로 인정한다.
export function dailyScale(
  insight: Insight,
  rows: ForecastPeople[],
): DailyScale | null {
  const scale = insightEvidence(insight).find((item) => item.dailyScale)
    ?.dailyScale as DailyScale | undefined;
  if (
    scale?.method !== "fixed" ||
    scale.basis !== "dailyMean.p50" ||
    scale.unit !== "명/일" ||
    scale.sampleSize !== rows.length ||
    !Array.isArray(scale.bands) ||
    scale.bands.length !== 3 ||
    scale.classCount !== 3
  )
    return null;
  for (const [index, band] of scale.bands.entries()) {
    if (
      !band ||
      band.grade !== index + 1 ||
      band.lowerInclusive !== index * 10000 ||
      band.upperExclusive !== (index === 2 ? null : (index + 1) * 10000) ||
      !Number.isInteger(band.count) ||
      band.count < 0
    )
      return null;
    const members = rows.filter((row) => row.dailyScaleGrade === band.grade);
    if (
      members.length !== band.count ||
      members.some(
        (row) =>
          row.dailyMean.p50 < band.lowerInclusive ||
          (band.upperExclusive !== null &&
            row.dailyMean.p50 >= band.upperExclusive),
      )
    )
      return null;
  }
  return scale.bands.reduce((total, band) => total + band.count, 0) ===
    rows.length
    ? scale
    : null;
}

// 화면 경계는 만 명 단위로 짧게 읽을 수 있게 표시한다.
export function scaleRange(band: ScaleBand) {
  if (band.grade === 1) return "1만 명/일 미만";
  if (band.grade === 2) return "1만~2만 명/일 미만";
  return "2만 명/일 이상";
}
// 등급 번호와 함께 사용할 방문객 규모 명칭이다.
export function scaleName(grade: number) {
  return ["소규모", "중규모", "대규모"][grade - 1];
}
