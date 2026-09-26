// 되묻기 입력을 게이트웨이가 받는 행사 초안 부분 객체로 바꾼다.

import commonSchema from "@crowdcast/contracts/schemas/common.schema.json";
import draftSchema from "@crowdcast/contracts/schemas/event-draft.schema.json";
import type { EventDraft } from "@crowdcast/contracts/types";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const eventTypes = commonSchema.$defs.eventType.enum;
const hostTypes = commonSchema.$defs.hostType.enum;
const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
ajv.addSchema(commonSchema);
const {
  missing: _missing,
  ambiguities: _ambiguities,
  ...answerProperties
} = draftSchema.properties;
const validateAnswer = ajv.compile({
  $id: "https://crowdcast.local/schemas/event-answer.web.json",
  type: "object",
  additionalProperties: false,
  properties: answerProperties,
});

export type Ask = {
  field: string;
  question: string;
  options: { label: string; value: string }[];
};

// 선택지가 생략된 열거형 질문도 계약의 정해진 값으로 보여 준다.
export function askOptions(ask: Ask): Ask["options"] {
  if (ask.options.length) return ask.options;
  const values =
    ask.field === "type"
      ? eventTypes
      : ask.field === "hostType"
        ? hostTypes
        : [];
  return values.map((value) => ({ label: value, value }));
}

// 장소 후보와 주최 유형 등 단일 선택은 질문 필드명으로 보낸다.
export function choiceAnswer(
  field: string,
  value: string,
): { text: string; answer: object } {
  return { text: value, answer: { [field]: value } };
}

// 날짜를 유지하고 시작·종료 시각을 ISO 시각으로 보낸다.
export function timeAnswer(
  date: string,
  start: string,
  end: string,
): { text: string; answer: Pick<EventDraft, "startsAt" | "endsAt"> } {
  return {
    text: `${date} ${start}~${end}`,
    answer: {
      startsAt: `${date}T${start}:00+09:00`,
      endsAt: `${date}T${end}:00+09:00`,
    },
  };
}

// 위험요소 복수 선택과 해당 없음은 모두 배열로 보낸다.
export function hazardsAnswer(values: EventDraft["hazards"]): {
  text: string;
  answer: Pick<EventDraft, "hazards">;
} {
  return {
    text: values.length ? values.join(", ") : "해당 없어요",
    answer: { hazards: values },
  };
}

type ReplyInputs = {
  choices: Record<string, string>;
  hazards: EventDraft["hazards"] | null;
  date: string;
  start: string;
  end: string;
};

// 직전 질문의 필드만 모아 한 번의 답으로 보내고 선택·시각을 검증한다.
export function combinedAnswer(
  asks: Ask[],
  inputs: ReplyInputs,
): { text: string; answer: object } {
  const answer: Record<string, unknown> = {};
  const summaries: string[] = [];
  for (const ask of asks) {
    if (ask.field === "time") {
      const { date, start, end } = inputs;
      const valid =
        /^\d{4}-\d{2}-\d{2}$/.test(date) &&
        /^\d{2}:\d{2}$/.test(start) &&
        /^\d{2}:\d{2}$/.test(end);
      if (
        !valid ||
        Number.isNaN(Date.parse(`${date}T${start}:00+09:00`)) ||
        Number.isNaN(Date.parse(`${date}T${end}:00+09:00`)) ||
        end <= start
      )
        throw new Error("시작·종료 날짜와 시각을 확인해 주세요.");
      Object.assign(answer, timeAnswer(date, start, end).answer);
      summaries.push(`${date} ${start}~${end}`);
    } else if (ask.field === "hazards") {
      if (inputs.hazards === null)
        throw new Error("위험요소를 고르거나 해당 없어요를 선택해 주세요.");
      const allowed = ask.options
        .filter((option) => option.value !== "[]")
        .map((option) => option.value);
      if (inputs.hazards.some((value) => !allowed.includes(value)))
        throw new Error("위험요소 선택값을 확인해 주세요.");
      answer.hazards = inputs.hazards;
      summaries.push(inputs.hazards.join(", ") || "해당 없어요");
    } else {
      const choice = inputs.choices[ask.field]?.trim();
      const allowed = askOptions(ask).map((option) => option.value);
      const fixedChoice = ["type", "hostType", "fee"].includes(ask.field);
      if (
        !choice ||
        (fixedChoice && allowed.length > 0 && !allowed.includes(choice))
      )
        throw new Error(`${ask.question} 답을 확인해 주세요.`);
      answer[ask.field] = choice;
      summaries.push(choice);
    }
  }
  // 부분 답도 행사 초안의 각 필드 계약으로 확인한 뒤 전송한다.
  if (!validateAnswer(answer))
    throw new Error(
      `답 형식을 확인해 주세요: ${ajv.errorsText(validateAnswer.errors)}`,
    );
  return { text: summaries.join(" · "), answer };
}
