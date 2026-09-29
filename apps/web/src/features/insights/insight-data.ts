// 지표별 표본 의미와 근거에 담긴 분포를 표시 전에 확인한다.
import type { Insight } from "@crowdcast/contracts/types";

export const LEVEL_NAMES = ["소규모", "수립 권고", "수립 대상", "대규모"];
export type Distribution = { label: string; value: number }[];

// I2의 전년 규모 자료가 없어도 모델 예보 결과는 표시한다.
export function headlineValue(insight: Insight): string | null {
  if (insight.sampleSize === 0) return null;
  if (
    insight.key === "I1" &&
    !(insight.comparablePairs && insight.comparablePairs > 0)
  )
    return null;
  const { value, unit } = insight.headline;
  if (unit === "비율") {
    const percent = value * 100;
    if (percent > 0 && percent < 0.1) return "0.1% 미만";
    if (percent > 99.9 && percent < 100) return "99.9% 초과";
    return `${percent.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;
  }
  if (unit === "배") return `${value.toFixed(1)}배`;
  return `${value.toLocaleString("ko-KR")}${unit}`;
}

// 출처가 연결된 근거의 구조화된 설명만 부가 정보로 읽는다.
export function insightEvidence(insight: Insight): Record<string, unknown>[] {
  return insight.evidence
    .filter((item) => insight.evidenceIds.includes(item.id))
    .flatMap((item) => {
      try {
        const value: unknown = JSON.parse(item.summary);
        return value && typeof value === "object" && !Array.isArray(value)
          ? [value as Record<string, unknown>]
          : [];
      } catch {
        return [];
      }
    });
}

// 일부 등급이 빠졌거나 표본 합계와 맞지 않으면 빈 등급을 임의로 채우지 않는다.
export function levelDistribution(
  insight: Insight,
  group: "model" | "host",
): Distribution | null {
  const prefix =
    group === "model" ? "모델 예보" : "주최측 발표 환산(전년 규모 대용)";
  const size = group === "model" ? insight.sampleSize : insight.comparablePairs;
  if (size == null || size <= 0) return null;
  const rows = LEVEL_NAMES.map((name, index) => {
    const matches = insight.series.filter(
      (row) => row.label === `${prefix} · ${index + 1}등급`,
    );
    return matches.length === 1
      ? { label: `${index + 1}등급 · ${name}`, value: matches[0].value }
      : null;
  });
  if (rows.some((row) => !row || !Number.isInteger(row.value) || row.value < 0))
    return null;
  const complete = rows as Distribution;
  return complete.reduce((sum, row) => sum + row.value, 0) === size
    ? complete
    : null;
}

// 분석 시각은 이용자의 컴퓨터 시간대와 관계없이 한국 시간으로 표시한다.
export function analysisTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

// 검증과 목록 표시가 동일한 한국 날짜를 사용한다.
export function analysisDay(value: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(
    new Date(value),
  );
}

// 예보가 실제 인용한 지역 방문 자료의 기간만 읽고 예정 행사 일정을 섞지 않는다.
export function forecastObservationPeriod(insight: Insight): string | null {
  const rows = insight.evidence.filter((item) => {
    if (
      !insight.evidenceIds.includes(item.id) ||
      item.source?.datasetId !== "ds-kto-visitors-15101972" ||
      !item.period
    )
      return false;
    try {
      return Array.isArray(JSON.parse(item.summary).inputEvidenceIds);
    } catch {
      return false;
    }
  });
  if (!rows.length) return null;
  const starts = rows
    .flatMap((row) => (row.period ? [row.period.from] : []))
    .sort();
  const ends = rows
    .flatMap((row) => (row.period ? [row.period.to] : []))
    .sort();
  return `${starts[0]} ~ ${ends.at(-1)}`;
}

// 복사된 결과에도 표본·기간·계산 시각과 서버의 해석 한계를 남긴다.
export function insightSentence(insight: Insight): string {
  const value = headlineValue(insight);
  const comparison =
    insight.key === "I2"
      ? `전년 발표 환산 자료 ${insight.comparablePairs == null ? "확인 필요" : `${insight.comparablePairs}건`}; 올해 실측 정답이 아닌 규모 참고 자료.`
      : "동일 행사·연도·기간·공간·단위를 확인한 비교 결과.";
  return [
    `${insight.title}: ${value ?? "비교 가능한 자료 확인 필요"}, 표본 ${insight.sampleSize.toLocaleString("ko-KR")}건, ${insight.key === "I2" ? "예보 대상 행사 일정 " : "비교 대상 기간 "}${insight.period.from}~${insight.period.to}.`,
    comparison,
    insight.headline.text,
    `계산 시각: ${analysisTime(insight.computedAt)} (한국 시간).`,
    `근거: ${insight.evidence
      .filter((item) => insight.evidenceIds.includes(item.id))
      .map(
        (item) =>
          `${item.title}${item.source?.accessUrl ? ` (${item.source.accessUrl})` : ""}`,
      )
      .join("; ")}`,
    "참고용 — 담당자 검토 필수",
  ].join("\n");
}
