/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 학습 실행(ModelRun). 기준 그래프에 등록한다
 */
export interface ModelCard {
  id: string;
  modelVersion: string;
  target: "일평균 방문객";
  trainRange: Period;
  /**
   * @minItems 1
   */
  features: [string, ...string[]];
  evalYears: number[];
  backtestRunId: string | null;
  createdAt: string;
  notes: string;
}
export interface Period {
  from: string;
  to: string;
}
