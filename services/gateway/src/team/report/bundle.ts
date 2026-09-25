// 해설·검증·배치가 공유하는 예보 근거 묶음과 문장 초안을 정의한다
import { randomUUID } from "node:crypto";
import type {
  Claim,
  Evidence,
  Forecast,
  RegionBaseline,
  SimilarEvent,
} from "@crowdcast/contracts/types";

export type ReportBundle = {
  forecast: Forecast;
  baseline: RegionBaseline | null;
  similar: SimilarEvent[];
};
export type DraftText = Pick<
  Claim,
  "text" | "claimType" | "evidenceIds" | "placeholders"
>;
export type CheckInput = {
  claims: Claim[];
  forecast: Forecast;
  revision: number;
};
export type CheckResult = { passed: boolean; rendered?: string };

// 같은 id의 근거는 분석 응답에서 받은 순서를 유지해 한 번만 싣는다
export function reportEvidence(bundle: ReportBundle): Evidence[] {
  return [
    ...new Map(
      [
        ...bundle.forecast.evidence,
        ...bundle.similar.flatMap((item) => item.evidence),
        ...(bundle.baseline?.evidence ?? []),
      ].map((item) => [item.id, item]),
    ).values(),
  ];
}

// 모델이 식별자·상태·검사 결과를 정하지 못하게 서버에서 초안을 감싼다
export function draftClaims(
  texts: DraftText[],
  sessionId: string,
  forecastId: string,
): Claim[] {
  return texts.map((text) => ({
    ...text,
    id: `c-${randomUUID()}`,
    sessionId,
    forecastId,
    status: "draft",
    rendered: null,
    checks: [],
    generatedBy: { agentId: "explainer", stepId: "st-pending" },
  }));
}
