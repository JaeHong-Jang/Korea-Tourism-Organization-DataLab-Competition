// 근거 그래프 적재 요청 타입과 OpenAPI에 정의된 revision 응답을 연결한다
import type {
  Claim,
  Event,
  Evidence,
  Forecast,
  RegionBaseline,
  SimilarEvent,
} from "@crowdcast/contracts/types";
import { contractRegistry } from "./registry.js";

// schema마다 계약에서 생성된 항목 타입을 사용해 다른 종류의 적재를 막는다
type FactTypes = {
  event: Event;
  forecast: Forecast;
  claim: Claim;
  evidence: Evidence;
  "similar-event": SimilarEvent;
  "region-baseline": RegionBaseline;
};
export type SessionFacts = {
  [Name in keyof FactTypes]: { schema: Name; items: FactTypes[Name][] };
}[keyof FactTypes];

// 별도 JSON Schema가 없는 /facts 성공 응답은 OpenAPI의 필수 정수만 검사한다
export const sessionRevisionSchema = contractRegistry.compile<{
  revision: number;
}>({
  type: "object",
  required: ["revision"],
  properties: { revision: { type: "integer" } },
});
