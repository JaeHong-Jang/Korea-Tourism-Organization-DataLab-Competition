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
     * 스냅샷 수치의 원래 숫자(JSON 숫자 표기 그대로) + 공백 + 단위 — 예: "21000 명". records는 스냅샷과 정확히 같지 않으면 거부한다
     */
    value: string;
    quantityId: string;
  }[];
};
