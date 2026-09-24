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
 * 행사 전 기간의 요일별 평시 방문
 */
export interface RegionBaseline {
  /**
   * 2025년 시군구 코드(방문자 API와 같다). IRI = http://crowdcast.local/id/<코드>
   */
  sigunguCode: string;
  sigunguName: string;
  period: Period;
  /**
   * @minItems 7
   * @maxItems 7
   */
  weekdayMean: [
    {
      weekday: number;
      local: number;
      nonlocal: number;
      foreign: number;
    },
    {
      weekday: number;
      local: number;
      nonlocal: number;
      foreign: number;
    },
    {
      weekday: number;
      local: number;
      nonlocal: number;
      foreign: number;
    },
    {
      weekday: number;
      local: number;
      nonlocal: number;
      foreign: number;
    },
    {
      weekday: number;
      local: number;
      nonlocal: number;
      foreign: number;
    },
    {
      weekday: number;
      local: number;
      nonlocal: number;
      foreign: number;
    },
    {
      weekday: number;
      local: number;
      nonlocal: number;
      foreign: number;
    }
  ];
  nonlocalShare: number;
  evidenceId: string;
  /**
   * @minItems 1
   */
  evidence: [NoName, ...NoName[]];
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
