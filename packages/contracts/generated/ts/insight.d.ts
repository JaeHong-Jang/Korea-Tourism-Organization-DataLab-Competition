/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 근거 조각. kind(=그래프 클래스)마다 반드시 채울 필드가 다르다
 */
export type NoName = {
  [k: string]: unknown;
} & {
  [k: string]: unknown;
} & {
  [k: string]: unknown;
} & {
  [k: string]: unknown;
} & {
  [k: string]: unknown;
} & {
  [k: string]: unknown;
} & {
  id: string;
  kind: "data" | "model" | "rule" | "case" | "assumption" | "check";
  title: string;
  summary: string;
  quantityIds: string[];
  period: Period | null;
  source: Source | null;
  availableAt: string | null;
  ruleId: string | null;
  clauseId: string | null;
  caseEventId: string | null;
  assumptionId: string | null;
  forecastId: string | null;
  modelVersion: string | null;
  checkResult: {
    checkKind: "evidence" | "number" | "rule" | "uncertainty" | "ood";
    passed: boolean;
    revision: number;
  } | null;
} & {
  id: string;
  kind: "data" | "model" | "rule" | "case" | "assumption" | "check";
  title: string;
  summary: string;
  quantityIds: string[];
  period: Period | null;
  source: Source | null;
  availableAt: string | null;
  ruleId: string | null;
  clauseId: string | null;
  caseEventId: string | null;
  assumptionId: string | null;
  forecastId: string | null;
  modelVersion: string | null;
  checkResult: {
    checkKind: "evidence" | "number" | "rule" | "uncertainty" | "ood";
    passed: boolean;
    revision: number;
  } | null;
};

/**
 * 문제 진단 지표. 표본 수·기간·근거를 함께
 */
export interface Insight {
  key: "I1" | "I2" | "I3" | "I4" | "I5" | "I6";
  title: string;
  headline: {
    value: number;
    unit: "명" | "명/일" | "%" | "원" | "배" | "비율";
    text: string;
  };
  sampleSize: number;
  comparablePairs: number | null;
  period: Period;
  series: {
    label: string;
    value: number;
  }[];
  /**
   * @minItems 1
   */
  evidenceIds: [string, ...string[]];
  /**
   * @minItems 1
   */
  evidence: [NoName, ...NoName[]];
  computedAt: string;
}
export interface Period {
  from: string;
  to: string;
}
export interface Source {
  datasetId: string;
  title: string;
  publisher: string;
  datalabMenu: string | null;
  accessUrl: string | null;
}
