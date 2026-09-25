// 해설가가 쓸 요인 문장 본문만 계약 속성으로 제한하고 식별자·검사 조작을 막는다

import claimSchema from "@crowdcast/contracts/schemas/claim.schema.json";
import { contractRegistry } from "../contract/registry.js";
import type { DraftText } from "../team/report/bundle.js";

// 상대 참조가 있는 계약 조각에는 원래 스키마 주소를 기준 URI로 준다
export const explanationSchema = {
  $id: "https://crowdcast.local/schemas/explanation-output.schema.json",
  type: "object",
  additionalProperties: false,
  required: ["claims"],
  properties: {
    claims: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "claimType", "evidenceIds", "placeholders"],
        properties: {
          text: { type: "string", minLength: 1, maxLength: 600 },
          claimType: { enum: ["요인"] },
          evidenceIds: claimSchema.properties.evidenceIds,
          placeholders: { type: "array", maxItems: 0 },
        },
      },
    },
  },
};
export const validateExplanation = contractRegistry.compile<{
  claims: DraftText[];
}>(explanationSchema);

// Ollama에는 외부 참조 없이 이번 요인들의 근거 id만 고를 수 있는 구조를 전달해 JSON 문법을 강제한다
export function ollamaExplanationSchema(evidenceIds: string[], count: number) {
  const schema = JSON.parse(
    JSON.stringify(explanationSchema, (_key, value) => {
      if (value?.$ref === "common.schema.json#/$defs/evidenceId")
        return { type: "string", enum: [...new Set(evidenceIds)] };
      return value;
    }),
  );
  schema.properties.claims.minItems = count;
  schema.properties.claims.maxItems = count;
  schema.properties.claims.items.properties.evidenceIds.minItems = 1;
  return schema;
}
