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
   * 판정 결과를 보이는 방식. 없으면 확률. 등급·사유는 두 방식 모두 같은 확률 판정(판정 함수 하나)으로 정해지고, 구간(골드 표본이 부족할 때 — 06 §11 G0)은 표시만 바꾼다: 확률 %를 쓰지 않고 순간 최대 p10~p90과 '표본 한계로 구간 기준 표시'를 보인다
   */
  basis?: "확률" | "구간";
}
