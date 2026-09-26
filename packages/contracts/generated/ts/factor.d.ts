/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * SHAP 기여. label은 템플릿 문장(숫자 없음) — 발행 뒤에만 화면에 나간다
 */
export interface Factor {
  id: string;
  feature: string;
  direction: "up" | "down";
  contribution: number;
  label: string;
  /**
   * @minItems 1
   */
  evidenceIds: [string, ...string[]];
}
