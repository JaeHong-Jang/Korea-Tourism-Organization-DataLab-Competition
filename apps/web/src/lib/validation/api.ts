// 검증과 인사이트 응답을 계약 스키마로 검사해 화면에 전달한다.
import type {
  BacktestSummary,
  DatalabSpec,
  DatalabUsage,
  Insight,
  LedgerEntry,
  ModelCard,
  PreregistrationScores,
} from "@crowdcast/contracts/types";
import type { ValidateFunction } from "ajv";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const schemas = import.meta.glob(
  "../../../../../packages/contracts/schemas/*.schema.json",
  { eager: true, import: "default" },
);
for (const schema of Object.values(schemas)) ajv.addSchema(schema as object);

// 계약이 누락되거나 값이 틀리면 수치를 전달하지 않는다.
async function readContract<T>(
  path: string,
  validator: ValidateFunction,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error(`API 요청 실패: ${response.status}`);
  // 정상 응답의 깨진 JSON도 계약 오류로 분류해 숫자 표시를 막는다.
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error("API 계약 불일치: JSON 파싱 실패");
  }
  if (!validator(value))
    throw new Error(`API 계약 불일치: ${ajv.errorsText(validator.errors)}`);
  return value as T;
}

// 이름으로 등록된 계약 검사기를 찾아 사용한다.
function schema(name: string): ValidateFunction {
  const validator = ajv.getSchema(
    `https://crowdcast.local/schemas/${name}.schema.json`,
  );
  if (!validator) throw new Error(`API 계약 불일치: ${name} 스키마 없음`);
  return validator;
}

export const getBacktest = (signal?: AbortSignal) =>
  readContract<BacktestSummary>(
    "/api/validation/backtest",
    schema("backtest-summary"),
    signal,
  );
export const getModelCard = (signal?: AbortSignal) =>
  readContract<ModelCard>(
    "/api/validation/model-card",
    schema("model-card"),
    signal,
  );
export const getUsage = (signal?: AbortSignal) =>
  readContract<DatalabUsage>(
    "/api/evidence/stats",
    schema("datalab-usage"),
    signal,
  );
export const getScores = (signal?: AbortSignal) =>
  readContract<PreregistrationScores>(
    "/api/validation/preregistration",
    schema("preregistration-scores"),
    signal,
  );
// 경로와 응답의 인사이트 키가 다르면 다른 지표를 잘못 싣지 않는다.
export async function getInsight(
  key: "I1" | "I2",
  signal?: AbortSignal,
): Promise<Insight> {
  const insight = await readContract<Insight>(
    `/api/insights/${key}`,
    schema("insight"),
    signal,
  );
  if (insight.key !== key)
    throw new Error("API 계약 불일치: 인사이트 키 불일치");
  return insight;
}
export const getSpec = (signal?: AbortSignal) =>
  readContract<DatalabSpec>(
    "/api/insights/datalab-spec",
    schema("datalab-spec"),
    signal,
  );

// records OpenAPI의 인라인 검증 응답을 같은 규칙으로 검사한다.
const verifySchema = ajv.compile({
  type: "object",
  required: ["valid", "count", "brokenAt"],
  properties: {
    valid: { type: "boolean" },
    count: { type: "integer", minimum: 0 },
    brokenAt: { type: ["integer", "null"] },
  },
});
const ledgerSchema = ajv.compile({
  type: "array",
  items: { $ref: "https://crowdcast.local/schemas/ledger-entry.schema.json" },
});
export type LedgerVerification = {
  valid: boolean;
  count: number;
  brokenAt: number | null;
};
export const getLedgerVerification = (signal?: AbortSignal) =>
  readContract<LedgerVerification>(
    "/api/records/ledger/verify",
    verifySchema,
    signal,
  );
export const getLedger = (signal?: AbortSignal) =>
  readContract<LedgerEntry[]>("/api/records/ledger", ledgerSchema, signal);
