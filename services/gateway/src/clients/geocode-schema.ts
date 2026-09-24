// forecast OpenAPI의 장소 후보 응답을 좌표·행정구역 타입과 연결한다
import { contractRegistry } from "../contract/registry.js";

export type GeocodeCandidate = {
  sigunguCode: string;
  sigunguName: string;
  lat: number;
  lng: number;
  score: number;
};

// 후보 수가 여러 개인 경우의 선택은 동네지기가 담당한다
export const geocodeResponseSchema = contractRegistry.compile<{
  candidates: GeocodeCandidate[];
}>({
  type: "object",
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        required: ["sigunguCode", "sigunguName", "lat", "lng", "score"],
        properties: {
          sigunguCode: { type: "string", pattern: "^[0-9]{5}$" },
          sigunguName: { type: "string" },
          lat: { type: "number" },
          lng: { type: "number" },
          score: { type: "number" },
        },
      },
    },
  },
});
