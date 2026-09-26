/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * body = claimIds의 rendered를 순서대로 줄바꿈(\n)으로 이은 것(공백 정규화 없음, records가 저장할 때 확인). 잠금 필드는 수치 노드를 가리킨다
 */
export type PlanSection = {
  [k: string]: unknown;
} & {
  key:
    | "overview"
    | "organization"
    | "crowd-timeline"
    | "routes-evacuation"
    | "staffing"
    | "traffic-parking"
    | "medical-toilets"
    | "weather-emergency"
    | "non-crowd-risks";
  title: string;
  status: "작성됨" | "검토 필요";
  claimIds: string[];
  body: string;
  lockedFields: {
    /**
     * 잠근 수치 칸: 구간 수치는 p10·p50·p90, 단일 수치는 value
     */
    name: "p10" | "p50" | "p90" | "value";
    /**
     * 스냅샷 수치의 정규 숫자 표기 + 공백 + 단위 — 정규 표기 = 계약 canonical 규칙(rules/card-projection.mjs `canonical`: 정수 값이면 정수, 그 밖은 가장 짧은 십진 표기, -0은 0). 예: 21000.0 → "21000 명". records는 이 문자열과 정확히 같지 않으면 거부한다
     */
    value: string;
    quantityId: string;
  }[];
  /**
   * 작성자 메모(T-408 편집기) — 근거 없는 사용자 글. body·claimIds·lockedFields와 따로 저장하고, 화면·docx에서 '작성자 메모(근거 없음)'로 발행 문장과 구분한다. 없으면 빈 메모
   */
  notes?: string;
};
