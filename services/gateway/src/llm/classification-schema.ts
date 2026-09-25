// 후속 요청 분류 결과를 정해진 의도 하나로 제한한다
import { contractRegistry } from "../contract/registry.js";

export const intents = [
  "why",
  "save",
  "draft",
  "whatif",
  "new_event",
  "out_of_scope",
] as const;
export type Intent = (typeof intents)[number];
export const classificationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["intent"],
  properties: { intent: { type: "string", enum: intents } },
};
export const validateClassification = contractRegistry.compile<{
  intent: Intent;
}>(classificationSchema);
