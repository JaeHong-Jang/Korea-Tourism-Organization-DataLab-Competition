// LLM이 반환할 원문 필드만 제한하고 계산 필드는 출력 스키마에서 제외한다
import common from "@crowdcast/contracts/schemas/common.schema.json";
import type { EventDraft } from "@crowdcast/contracts/types";
import { contractRegistry } from "../../../contract/registry.js";

export type ExtractedFields = {
  name: string | null;
  typeText: string | null;
  dateText: string | null;
  timeText: string | null;
  venueText: string | null;
  feeText: string | null;
  hostText: string | null;
  budgetText: string | null;
  promo: string[];
  hazards: EventDraft["hazards"];
};

// 외부 참조 없는 스키마를 Ollama와 Ajv가 똑같이 사용한다
const originalText = { type: ["string", "null"], minLength: 1, maxLength: 500 };
export const extractionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "name",
    "typeText",
    "dateText",
    "timeText",
    "venueText",
    "feeText",
    "hostText",
    "budgetText",
    "promo",
    "hazards",
  ],
  properties: {
    name: originalText,
    typeText: originalText,
    dateText: originalText,
    timeText: originalText,
    venueText: originalText,
    feeText: originalText,
    hostText: originalText,
    budgetText: originalText,
    promo: {
      type: "array",
      maxItems: 10,
      items: { type: "string", minLength: 1, maxLength: 100 },
    },
    hazards: { type: "array", uniqueItems: true, items: common.$defs.hazard },
  },
};
export const validateExtraction =
  contractRegistry.compile<ExtractedFields>(extractionSchema);
export const validateDraft = contractRegistry.compile<EventDraft>({
  $ref: "https://crowdcast.local/schemas/event-draft.schema.json",
});

// 원문에 없는 행사 값은 생성된 사실로 사용하지 않는다
export function hasOriginalSpans(
  fields: ExtractedFields,
  text: string,
): boolean {
  const compact = (value: string) => value.replace(/\s+/g, "");
  const source = compact(text);
  const { hazards, promo, ...spans } = fields;
  return (
    [...Object.values(spans), ...promo].every(
      (value) =>
        value === null ||
        (compact(value).length > 0 && source.includes(compact(value))),
    ) && hazards.every((hazard) => source.includes(hazard))
  );
}
