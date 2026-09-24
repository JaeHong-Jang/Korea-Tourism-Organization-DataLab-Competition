// 본문이 있는 서비스 요청을 OpenAPI와 항목별 JSON Schema로 검증한다

import { contractRegistry } from "../contract/registry.js";
import type { SessionFacts } from "../contract/session-facts.js";

// 장소 검색 본문은 forecast OpenAPI의 선택 힌트까지 검사한다
export const geocodeRequestSchema = contractRegistry.compile<{
  venueText: string;
  sidoHint?: string | null;
}>({
  type: "object",
  required: ["venueText"],
  properties: {
    venueText: { type: "string" },
    sidoHint: { type: ["string", "null"] },
  },
});

// facts의 schema 판별값과 실제 항목 계약이 일치해야 전송한다
export const factsRequestSchema = contractRegistry.compile<SessionFacts>({
  oneOf: [
    "event",
    "forecast",
    "claim",
    "evidence",
    "similar-event",
    "region-baseline",
  ].map((name) => ({
    type: "object",
    required: ["schema", "items"],
    properties: {
      schema: { const: name },
      items: {
        type: "array",
        minItems: 1,
        items: { $ref: `https://crowdcast.local/schemas/${name}.schema.json` },
      },
    },
  })),
});
