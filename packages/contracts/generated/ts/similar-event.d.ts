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
 * 기록관 결과. 단위가 같을 때만 비교한다
 */
export interface SimilarEvent {
  eventId: string;
  name: string;
  year: number;
  sigunguName: string;
  type: "불꽃" | "공연" | "대학" | "먹거리" | "꽃" | "전통" | "기타";
  measured: Quantity | null;
  announced: Quantity | null;
  unitsComparable: boolean;
  similarity: number;
  evidenceId: string;
  /**
   * @minItems 1
   */
  evidence: [NoName, ...NoName[]];
}
/**
 * 수치 노드. 자리표시자는 id와 필드를 가리킨다
 */
export interface Quantity {
  id: string;
  name: string;
  value: number | null;
  p10: number | null;
  p50: number | null;
  p90: number | null;
  /**
   * 인원(명·명/일)·비율(%·비율·배)·금액(원)·기간(일 — 예: 반영한 임시공휴일 일수)
   */
  unit: "명" | "명/일" | "%" | "원" | "배" | "비율" | "일";
  timeUnit: "순간" | "일" | "기간누적";
  spatialScope: "행사장" | "행정동" | "시군구";
  valueKind: "사전예상" | "사후집계" | "예측" | "관측";
  estimated: boolean;
  assumptionIds: string[];
  announcedAt: string | null;
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
