// 발행 예보서의 문장 순서와 숫자 표기를 스냅샷 안에서만 정한다.
import type { Claim, ForecastReport } from "@crowdcast/contracts/types";
import { formatSnapshotNumber } from "../../lib/format";

// 수치 필드의 원래 값을 천 단위 쉼표만 더해 표시한다.
export function reportNumber(value: number | null): string {
  return formatSnapshotNumber(value);
}

// 레이아웃에 실린 발행 문장을 한 번씩, 발행 순서대로 꺼낸다.
export function orderedClaims(report: ForecastReport): Claim[] {
  const byId = new Map(report.claims.map((claim) => [claim.id, claim]));
  const seen = new Set<string>();
  const laidOut = report.layout.flatMap((slot) =>
    slot.claimIds.flatMap((id) => {
      const claim = byId.get(id);
      if (claim?.status !== "published" || seen.has(id)) return [];
      seen.add(id);
      return [claim];
    }),
  );
  return [
    ...laidOut,
    ...report.claims.filter(
      (claim) => claim.status === "published" && !seen.has(claim.id),
    ),
  ];
}

// 자리표시자의 숫자는 결정적 예보 수치에서만 찾고 문장에 삽입한다.
export function claimText(claim: Claim, report: ForecastReport): string {
  const quantities = [
    report.forecast.peakConcurrent,
    report.forecast.dailyMean,
    report.event.expectedByHost,
    ...report.similar.flatMap((item) => [item.measured, item.announced]),
  ].filter((item) => item != null);
  if (!claim.placeholders.length) {
    const rendered = claim.rendered ?? claim.text;
    return report.forecast.judgment.basis === "구간" && rendered.includes("%")
      ? "표본 한계로 확률 수치를 표시하지 않아요."
      : rendered;
  }
  let text = claim.text;
  for (const placeholder of claim.placeholders) {
    const quantity = quantities.find(
      (item) => item.id === placeholder.quantityId,
    );
    const value = quantity?.[placeholder.field];
    if (value == null) return "수치 자료 없음";
    text = text.replaceAll(`{{${placeholder.name}}}`, reportNumber(value));
  }
  return report.forecast.judgment.basis === "구간" && text.includes("%")
    ? "표본 한계로 확률 수치를 표시하지 않아요."
    : text;
}
