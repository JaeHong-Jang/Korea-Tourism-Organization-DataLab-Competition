/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * M8-F2 평가 결과, M8-F3 데이터 최신성·모델 버전·근거 그래프 크기. 게이트웨이가 세 서비스와 reports/evals에서 모은다
 */
export interface OpsStatus {
  generatedAt: string;
  freshness: Freshness[];
  model: {
    modelRunId: string;
    modelVersion: string;
    trainRange: Period;
    createdAt: string;
  };
  graph: GraphStats;
  evals: EvalSummary | null;
}
export interface Freshness {
  datasetId: string;
  title: string;
  lastCollectedAt: string | null;
  lastObservedDate: string | null;
  rows: number | null;
}
export interface Period {
  from: string;
  to: string;
}
export interface GraphStats {
  masterVersion: number;
  masterTriples: number;
  sessions: number;
  sessionTriples: number;
}
export interface EvalSummary {
  suite: string;
  runAt: string;
  cases: number;
  /**
   * 근거 없이 발행된 문장 수(0이어야 통과)
   */
  unsupportedPublished: number;
  /**
   * 화면 숫자와 수치 노드가 다른 건수(0이어야 통과)
   */
  numberMismatch: number;
  passed: boolean;
}
