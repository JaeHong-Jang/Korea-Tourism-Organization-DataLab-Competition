// 게이트웨이 응답을 계약 스키마로 검증한 뒤 화면에 전달한다.
/// <reference types="vite/client" />

import type {
  FestivalSummary,
  ForecastReport,
} from "@crowdcast/contracts/types";
import type { ValidateFunction } from "ajv";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const schemas = import.meta.glob(
  "../../../../packages/contracts/schemas/*.schema.json",
  { eager: true, import: "default" },
);
for (const schema of Object.values(schemas)) ajv.addSchema(schema as object);
const festivalValidator = ajv.getSchema(
  "https://crowdcast.local/schemas/festival-summary.schema.json",
);
const festivalListValidator = ajv.compile({
  type: "array",
  items: {
    $ref: "https://crowdcast.local/schemas/festival-summary.schema.json",
  },
});
const reportValidator = ajv.getSchema(
  "https://crowdcast.local/schemas/forecast-report.schema.json",
);

// 스키마가 빠진 배포를 정상 응답으로 취급하지 않는다.
function requireValidator(
  validator: ValidateFunction | undefined,
): ValidateFunction {
  if (!validator) throw new Error("계약 스키마를 찾을 수 없어요.");
  return validator;
}

// 실패 응답을 그대로 삼키지 않아 화면에서 오류 상태를 표시할 수 있게 한다.
async function getJson<T>(
  path: string,
  validator: ValidateFunction,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api${path}`, { signal });
  if (!response.ok) throw new Error(`API 요청 실패: ${response.status}`);
  const data: unknown = await response.json();
  if (!validator(data))
    throw new Error(`API 계약 불일치: ${ajv.errorsText(validator.errors)}`);
  return data as T;
}

// 화면에 표시할 행사 목록을 게이트웨이에서 받는다.
export function getFestivals(signal?: AbortSignal): Promise<FestivalSummary[]> {
  // 목록 전체와 각 항목을 검증해 일부 잘못된 행사도 화면에서 제외하지 않고 오류로 돌린다.
  requireValidator(festivalValidator);
  return getJson<FestivalSummary[]>(
    "/festivals",
    festivalListValidator,
    signal,
  );
}

// 예보서 수치는 계약의 값을 그대로 받는다.
export function getForecastReport(
  forecastId: string,
  signal?: AbortSignal,
): Promise<ForecastReport> {
  return getJson<ForecastReport>(
    `/forecasts/${encodeURIComponent(forecastId)}`,
    requireValidator(reportValidator),
    signal,
  );
}
