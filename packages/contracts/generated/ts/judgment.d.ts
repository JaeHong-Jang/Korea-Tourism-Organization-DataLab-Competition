/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 판정 엔진(결정적 규칙)의 결과. 판정 문구는 규칙 결과 템플릿에서만 나온다
 */
export interface Judgment {
  /**
   * 1 소규모 · 2 수립 권고 · 3 수립 대상 · 4 대규모
   */
  level: number;
  label: "소규모" | "수립 권고" | "수립 대상" | "대규모";
  /**
   * @minItems 1
   */
  reasons: [
    {
      ruleId: string;
      kind: "법정" | "자체";
      text: string;
      clauseId: string | null;
      evidenceId: string;
    },
    ...{
      ruleId: string;
      kind: "법정" | "자체";
      text: string;
      clauseId: string | null;
      evidenceId: string;
    }[]
  ];
  checklist: {
    id: string;
    text: string;
    ruleId: string;
    /**
     * @minItems 1
     */
    evidenceIds: [string, ...string[]];
  }[];
}
