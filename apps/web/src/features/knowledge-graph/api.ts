// 전체 근거 그래프 응답을 계약으로 검사해 화면에 전달한다.
import type { KnowledgeGraph } from "@crowdcast/contracts/types";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const schemas = import.meta.glob(
  "../../../../../packages/contracts/schemas/*.schema.json",
  { eager: true, import: "default" },
);
for (const schema of Object.values(schemas)) ajv.addSchema(schema as object);
const validate = ajv.getSchema(
  "https://crowdcast.local/schemas/knowledge-graph.schema.json",
);

// 잘못된 응답은 일부 노드만 표시하지 않고 계약 오류로 돌린다.
export async function getKnowledgeGraph(
  signal?: AbortSignal,
): Promise<KnowledgeGraph> {
  const response = await fetch("/api/evidence/graph", { signal });
  if (!response.ok) throw new Error(`API 요청 실패: ${response.status}`);
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error("API 계약 불일치: JSON 파싱 실패");
  }
  if (!validate?.(value))
    throw new Error(`API 계약 불일치: ${ajv.errorsText(validate?.errors)}`);
  return value as KnowledgeGraph;
}
