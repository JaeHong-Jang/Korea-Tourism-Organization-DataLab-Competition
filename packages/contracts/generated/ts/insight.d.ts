/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 문제 진단 지표(06 §7). 표본 수·기간을 숨기지 않는다
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
  computedAt: string;
}
export interface Period {
  from: string;
  to: string;
}
