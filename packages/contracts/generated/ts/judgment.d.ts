/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 판정 엔진 결과. ruleIds = 판정에 쓴 규칙(그래프 cc:judgedBy), 사유 문구는 규칙 결과 템플릿
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
  ruleIds: [string, ...string[]];
  /**
   * @minItems 1
   */
  reasons: [
    {
      [k: string]: unknown;
    },
    ...{
      [k: string]: unknown;
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
  /**
   * 판정 근거 방식. 없으면 확률. 구간 = 골드 표본이 부족할 때(06 §11 G0) 순간 최대 p10·p50·p90과 기준값을 직접 비교한 판정 — 화면은 확률 %를 보이지 않는다
   */
  basis?: "확률" | "구간";
}
