/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 안전관리계획 초안의 한 섹션
 */
export interface PlanSection {
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
}
