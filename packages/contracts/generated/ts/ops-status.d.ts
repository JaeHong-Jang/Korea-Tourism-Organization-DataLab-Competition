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
    /**
     * 사용 모델 검증 상태(선택 — promoted.json의 verdict)
     */
    verdict?: "통과" | "미검증";
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
  /**
   * 항목별 통과/전체(선택 — 평가 결과 파일의 summary.checks 그대로, 예: sequence·evidence·numbers·ask)
   */
  checks?: {
    [k: string]: {
      passed: number;
      total: number;
    };
  };
  /**
   * 지연(초, 선택): 첫 요청 → forecast 카드, → 발행 done(되묻기 왕복 제외)
   */
  latencySeconds?: {
    forecast: {
      n: number;
      p50: number | null;
      p95: number | null;
    };
    publishedDone: {
      n: number;
      p50: number | null;
      p95: number | null;
    };
  } | null;
  /**
   * 실제 서비스 실행인지 가짜 서비스 실행인지(선택)
   */
  mode?: "live" | "fake";
}
