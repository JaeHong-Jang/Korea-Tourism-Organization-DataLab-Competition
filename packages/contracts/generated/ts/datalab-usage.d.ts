/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 근거 대시보드(M6-F5)·서식4. 전체 연결률과 데이터랩까지 이어지는 비율을 따로
 */
export interface DatalabUsage {
  generatedAt: string;
  publishedClaims: number;
  claimsWithEvidence: number;
  claimsReachingDatalab: number;
  evidenceByDataset: {
    datasetId: string;
    title: string;
    datalabMenu: string | null;
    count: number;
  }[];
  shaclPassRate: number | null;
}
