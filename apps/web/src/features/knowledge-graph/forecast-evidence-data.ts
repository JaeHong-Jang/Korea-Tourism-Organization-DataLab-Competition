// 발행 기록의 명시적 연결만으로 근거 역할과 단계별 자료를 분류한다.
import type { Evidence, ForecastReport } from "@crowdcast/contracts/types";

export type EvidenceStage =
  | "all"
  | "daily"
  | "conversion"
  | "peak"
  | "judgment";
export type EvidenceRole =
  | "model"
  | "conversion"
  | "judgment"
  | "checklist"
  | "factor"
  | "check"
  | "reference"
  | "unconfirmed";
export const roleLabels: Record<EvidenceRole, string> = {
  model: "예측 모델",
  conversion: "환산에 사용",
  judgment: "판정에 사용",
  checklist: "체크리스트 근거",
  factor: "요인 설명 근거",
  check: "검사 기록",
  reference: "참고 자료",
  unconfirmed: "사용 확인 필요",
};

// 예보에 첨부된 근거를 식별자로 합치고 발행본의 문구를 우선한다.
export function snapshotEvidence(report: ForecastReport): Evidence[] {
  return [
    ...new Map(
      [...report.forecast.evidence, ...report.evidence].map((item) => [
        item.id,
        item,
      ]),
    ).values(),
  ];
}

// 과거 버전의 일반 문장이나 손상된 요약도 그대로 열 수 있게 한다.
export function evidencePayload(
  evidence: Evidence,
): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(evidence.summary);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

// 같은 데이터셋의 여러 관측을 섞지 않도록 관측 식별자까지 일치시킨다.
export function evidenceObservation(
  report: ForecastReport,
  evidence: Evidence,
) {
  const payload = evidencePayload(evidence);
  return report.forecast.observations.find(
    (item) =>
      item.id === payload?.id && item.datasetId === evidence.source?.datasetId,
  );
}

// 자료가 첨부되었다는 이유만으로 예측값 계산에 사용됐다고 단정하지 않는다.
export function evidenceRole(
  report: ForecastReport,
  evidence: Evidence,
): EvidenceRole {
  const forecast = report.forecast;
  if (
    evidence.assumptionId &&
    forecast.peakConcurrent.assumptionIds.includes(evidence.assumptionId)
  )
    return "conversion";
  if (evidence.ruleId && forecast.judgment.ruleIds.includes(evidence.ruleId))
    return "judgment";
  if (
    forecast.judgment.checklist.some((item) =>
      item.evidenceIds.includes(evidence.id),
    )
  )
    return "checklist";
  if (
    evidence.kind === "model" &&
    evidence.forecastId === report.forecastId &&
    evidence.modelVersion === forecast.modelVersion
  )
    return "model";
  if (forecast.factors.some((item) => item.evidenceIds.includes(evidence.id)))
    return "factor";
  if (evidence.kind === "check") return "check";
  if (evidence.kind === "data" || evidence.kind === "model")
    return "unconfirmed";
  return "reference";
}

// 화면의 단계 선택은 실제 수치·가정·판정 연결로만 근거를 좁힌다.
export function evidenceAtStage(
  report: ForecastReport,
  evidence: Evidence,
  stage: EvidenceStage,
) {
  const role = evidenceRole(report, evidence);
  if (stage === "all") return true;
  if (stage === "conversion") return role === "conversion";
  if (stage === "judgment") return role === "judgment" || role === "checklist";
  const quantity =
    stage === "daily"
      ? report.forecast.dailyMean
      : report.forecast.peakConcurrent;
  return (
    evidence.quantityIds.includes(quantity.id) ||
    (stage === "daily" && (role === "model" || role === "factor"))
  );
}

// 발행 시각은 초까지 보여 같은 날 재발행한 기록도 구별한다.
export function publishedLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

// 내 행사와 예보서에서 같은 발행 기록을 바로 열도록 주소를 만든다.
export function forecastEvidenceHref(report: ForecastReport) {
  return `/graph?${new URLSearchParams({ eventId: report.event.id, forecastId: report.forecastId })}`;
}
