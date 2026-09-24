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
    name: string;
    value: string;
    quantityId: string;
  }[];
};
