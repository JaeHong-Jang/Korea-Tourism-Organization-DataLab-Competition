/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 근거 조각(09 §3). 종류마다 반드시 채울 필드가 다르다
 */
export type Evidence = {
  [k: string]: unknown;
} & {
  id: string;
  kind: "data" | "model" | "rule" | "case" | "assumption" | "check";
  title: string;
  summary: string;
  quantityIds: string[];
  source: Source | null;
  availableAt: string | null;
  ruleId: string | null;
  clauseId: string | null;
  caseEventId: string | null;
  assumptionId: string | null;
  modelVersion: string | null;
  check: {
    kind: "evidence" | "number" | "rule" | "uncertainty" | "ood";
    passed: boolean;
    revision: number;
  } | null;
};

export interface Source {
  datasetId: string;
  title: string;
  publisher: string;
  /**
   * 데이터랩 메뉴 경로(예: 빅데이터 > 지역별 방문자수)
   */
  datalabMenu: string | null;
  accessUrl: string | null;
}
