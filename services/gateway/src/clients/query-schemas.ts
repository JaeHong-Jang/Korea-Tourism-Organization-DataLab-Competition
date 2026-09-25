// 조회 응답의 생성 타입을 OpenAPI가 참조하는 원본 스키마와 연결한다
import type {
  BacktestSummary,
  DatalabSpec,
  DatalabUsage,
  FestivalSummary,
  Insight,
  KnowledgeGraph,
  ModelCard,
  OpsStatus,
  PipelineRun,
  PreregistrationScores,
} from "@crowdcast/contracts/types";
import { contractRegistry } from "../contract/registry.js";

// OpenAPI의 단일 객체와 하위 정의 참조를 동일한 Ajv 레지스트리에서 읽는다
export function querySchema<T>(name: string, fragment = "") {
  return contractRegistry.compile<T>({
    $ref: `https://crowdcast.local/schemas/${name}.schema.json${fragment}`,
  });
}

// OpenAPI의 배열 래퍼와 중첩 항목을 함께 검증한다
export function queryListSchema<T>(name: string, fragment = "") {
  return contractRegistry.compile<T[]>({
    type: "array",
    items: {
      $ref: `https://crowdcast.local/schemas/${name}.schema.json${fragment}`,
    },
  });
}

// forecast·knowledge와 gateway가 공유하는 응답 계약을 요청 전에 컴파일한다
export const festivalsSchema =
  queryListSchema<FestivalSummary>("festival-summary");
export const backtestSchema = querySchema<BacktestSummary>("backtest-summary");
export const preregistrationSchema = querySchema<PreregistrationScores>(
  "preregistration-scores",
);
export const modelCardSchema = querySchema<ModelCard>("model-card");
export const insightSchema = querySchema<Insight>("insight");
export const datalabSpecSchema = querySchema<DatalabSpec>("datalab-spec");
export const datalabUsageSchema = querySchema<DatalabUsage>("datalab-usage");
export const runsSchema = queryListSchema<PipelineRun>("pipeline-run");
export const freshnessSchema = queryListSchema<OpsStatus["freshness"][number]>(
  "ops-status",
  "#/$defs/freshness",
);
export const graphStatsSchema = querySchema<OpsStatus["graph"]>(
  "ops-status",
  "#/$defs/graphStats",
);
export const opsStatusSchema = querySchema<OpsStatus>("ops-status");
export const evalSummarySchema = querySchema<NonNullable<OpsStatus["evals"]>>(
  "ops-status",
  "#/$defs/evalSummary",
);
export const regionsSchema = contractRegistry.compile<Record<string, unknown>>({
  type: "object",
});

// 전체 기준 그래프도 생성 타입과 원본 계약을 함께 검사한다
export const knowledgeGraphSchema =
  querySchema<KnowledgeGraph>("knowledge-graph");
