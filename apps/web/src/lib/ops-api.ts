// 운영 API 응답을 계약으로 검증해 실행 기록과 상태를 전달한다.
import type { OpsStatus, PipelineRun } from "@crowdcast/contracts/types";
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
const runListValidator = ajv.compile({
  type: "array",
  items: { $ref: "https://crowdcast.local/schemas/pipeline-run.schema.json" },
});
const statusId = "https://crowdcast.local/schemas/ops-status.schema.json";
const statusValidator = ajv.getSchema(statusId);

// 상태 응답의 서로 다른 카드가 필요한 필드만 계약의 원래 정의로 검증한다.
function statusPart(fields: string[]): ValidateFunction {
  return ajv.compile({
    type: "object",
    required: fields,
    properties: Object.fromEntries(
      fields.map((field) => [
        field,
        { $ref: `${statusId}#/properties/${field}` },
      ]),
    ),
  });
}
const evalValidator = statusPart(["generatedAt", "evals"]);
const freshnessValidator = statusPart([
  "generatedAt",
  "freshness",
  "model",
  "graph",
]);
export type OpsEvaluation = Pick<OpsStatus, "generatedAt" | "evals">;
export type OpsFreshness = Pick<
  OpsStatus,
  "generatedAt" | "freshness" | "model" | "graph"
>;

// 스키마가 없거나 응답 항목이 어긋나면 잘못된 운영 수치를 표시하지 않는다.
async function readOps<T>(
  path: string,
  validator: ValidateFunction | undefined,
  signal?: AbortSignal,
): Promise<T> {
  if (!validator) throw new Error("API 계약 불일치: 운영 스키마 없음");
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error(`API 요청 실패: ${response.status}`);
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

// 실행 목록은 OpenAPI의 배열 항목마다 pipeline-run 계약을 적용한다.
export const getOpsRuns = (signal?: AbortSignal) =>
  readOps<PipelineRun[]>("/api/ops/runs", runListValidator, signal);

// 전체 운영 상태를 읽을 때는 최상위 계약의 모든 필드를 검사한다.
export const getOpsStatus = (signal?: AbortSignal) =>
  readOps<OpsStatus>("/api/ops/status", statusValidator, signal);

// 한 부분의 불일치가 다른 카드의 정상 값까지 숨기지 않도록 나눠 읽는다.
export const getOpsEvaluation = (signal?: AbortSignal) =>
  readOps<OpsEvaluation>("/api/ops/status", evalValidator, signal);
export const getOpsFreshness = (signal?: AbortSignal) =>
  readOps<OpsFreshness>("/api/ops/status", freshnessValidator, signal);
