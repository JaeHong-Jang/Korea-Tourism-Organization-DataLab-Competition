// 서비스 응답 스키마와 계약에서 생성한 타입을 연결한다
import type {
  Event,
  Evidence,
  Forecast,
  ForecastReport,
  GateReport,
  RegionBaseline,
  SimilarEvent,
  Weather,
} from "@crowdcast/contracts/types";
import type { ValidateFunction } from "ajv";
import { contractRegistry } from "./registry.js";

// 클라이언트가 다루는 도메인 응답만 생성 타입에 연결한다
type Responses = {
  event: Event;
  evidence: Evidence;
  forecast: Forecast;
  "forecast-report": ForecastReport;
  "gate-report": GateReport;
  "region-baseline": RegionBaseline;
  "similar-event": SimilarEvent;
  weather: Weather;
};

// 등록된 스키마를 재사용하며 스키마가 빠졌으면 시작 시 명확하게 실패한다
export function responseSchema<Name extends keyof Responses>(
  name: Name,
): ValidateFunction<Responses[Name]> {
  const validate = contractRegistry.getSchema<Responses[Name]>(
    `https://crowdcast.local/schemas/${name}.schema.json`,
  );
  if (!validate) throw new Error(`응답 계약을 찾을 수 없습니다: ${name}`);
  return validate;
}

// 목록도 배열 자체와 각 항목을 모두 검증해 잘못된 래퍼를 허용하지 않는다
export function responseListSchema<Name extends keyof Responses>(
  name: Name,
): ValidateFunction<Responses[Name][]> {
  return contractRegistry.compile<Responses[Name][]>({
    type: "array",
    items: { $ref: `https://crowdcast.local/schemas/${name}.schema.json` },
  });
}

// 세 백엔드의 OpenAPI /health에만 정의된 공통 응답을 그대로 검증한다
export const serviceHealthSchema = contractRegistry.compile<{
  status: "ok";
  version: string;
}>({
  type: "object",
  required: ["status", "version"],
  properties: { status: { const: "ok" }, version: { type: "string" } },
});
