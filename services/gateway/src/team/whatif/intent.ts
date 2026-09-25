// 조건 변경의 종류를 키워드로 고르고 모호한 분류는 같은 LLM 응답에서 받는다
import { contractRegistry } from "../../contract/registry.js";
import {
  classificationSchema,
  type Intent,
} from "../../llm/classification-schema.js";

export const whatifKinds = [
  "date",
  "time",
  "fee",
  "type",
  "weather",
  "similar",
] as const;
export type WhatifKind = (typeof whatifKinds)[number];
export type Classification = { intent: Intent; whatifKind?: WhatifKind };
export const followupSchema = {
  ...classificationSchema,
  properties: {
    ...classificationSchema.properties,
    whatifKind: { type: "string", enum: whatifKinds },
  },
};
export const validateFollowup =
  contractRegistry.compile<Classification>(followupSchema);
const rules: [WhatifKind, RegExp][] = [
  [
    "date",
    /요일|날짜|일정|\d{4}-\d{2}-\d{2}|\d+\s*월\s*\d+\s*일|내일(?:이면|은|로)|다음\s*주/,
  ],
  ["time", /밤|낮|저녁|오전|오후|주간|야간|종일|시간대/],
  ["fee", /유료|무료|입장료|요금/],
  ["type", /(?:불꽃|공연|대학|먹거리|꽃|전통|기타)(?:으?로|이?면)|유형/],
  ["weather", /(?:비|눈)\s*(?:가\s*)?오면|우천|강수/],
  [
    "similar",
    /비슷한\s*(?:행사|축제)|유사\s*(?:행사|축제)|다른\s*(?:행사|축제)(?!\s*(?:예보|예측|해\s*줘|만들))/,
  ],
];

// 여러 조건이 섞이면 값을 임의로 버리지 않고 선택 질문으로 보낸다
export function whatifMatches(text: string): WhatifKind[] {
  return rules
    .filter(([, pattern]) => pattern.test(text))
    .map(([kind]) => kind);
}

// 최초 행사 설명 속 날짜·요금은 후속 질문으로 오인하지 않는다
export function isInitialWhatif(text: string) {
  return (
    whatifMatches(text).length > 0 &&
    /이면|라면|오면|(?:유료|무료)면|바꾸|바꿔|변경|비슷한\s*(?:행사|축제)|유사\s*(?:행사|축제)|다른\s*행사는/.test(
      text,
    )
  );
}
