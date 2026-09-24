/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * SHAP 기여를 요인 문장으로 옮긴 것
 */
export interface Factor {
  id: string;
  feature: string;
  direction: "up" | "down";
  /**
   * log 규모 기여도
   */
  contribution: number;
  /**
   * 템플릿 문장(숫자 없음)
   */
  label: string;
  /**
   * @minItems 1
   */
  evidenceIds: [string, ...string[]];
}
