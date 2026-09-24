// 되묻기 답을 기존 초안에 병합하고 필수값과 모호성을 다시 계산한다

import draftSchema from "@crowdcast/contracts/schemas/event-draft.schema.json";
import type { EventDraft } from "@crowdcast/contracts/types";
import { contractRegistry } from "../../contract/registry.js";
import { eventTime } from "./event-time.js";
import { draftQuestions } from "./normalize/draft.js";
import { normalizeVenue } from "./normalize/venue.js";

export type DraftAnswer = Partial<Omit<EventDraft, "missing" | "ambiguities">>;
export type TeamMessage = { text: string; answer?: DraftAnswer | null };
const {
  missing: _missing,
  ambiguities: _ambiguities,
  ...answerProperties
} = draftSchema.properties;

// answer는 초안 필드의 부분 객체이며 계산된 missing·ambiguities는 받지 않는다
export const validateMessage = contractRegistry.compile<TeamMessage>({
  $id: "https://crowdcast.local/schemas/team-message.json",
  type: "object",
  required: ["text"],
  properties: {
    text: { type: "string", maxLength: 8_000 },
    answer: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: answerProperties,
    },
  },
});

// 선택 정보는 계약의 미상 값으로 두고 필요한 질문만 묶어서 만든다
export function completeDraft(
  draft: EventDraft,
  answer: DraftAnswer | null | undefined,
  askedFields: readonly string[] = [],
) {
  // 직전 질문의 필드만 받으며 시각 묶음은 시작·종료 일시에만 대응한다
  const allowed = new Set(
    askedFields.flatMap((field) =>
      field === "time" ? ["startsAt", "endsAt"] : [field],
    ),
  );
  const ignoredFields = Object.keys(answer ?? {}).filter(
    (field) => !allowed.has(field),
  );
  answer = Object.fromEntries(
    Object.entries(answer ?? {}).filter(([field]) => allowed.has(field)),
  ) as DraftAnswer;
  const next = { ...structuredClone(draft), ...answer };
  if (answer?.venueText !== undefined)
    Object.assign(next, normalizeVenue(next.venueText), {
      sigunguCode: answer.sigunguCode ?? null,
    });
  if (answer)
    next.ambiguities = next.ambiguities.filter((item) => {
      if (item.field === "venue")
        return (
          answer.venueText === undefined && answer.sigunguCode === undefined
        );
      return !Object.hasOwn(answer, item.field);
    });

  // 요금·예산은 묻지 않고 확정 시각이 있으면 시간대를 규칙으로 덮어쓴다
  next.fee ??= "미상";
  next.budgetKrw ??= null;
  if (next.startsAt && next.endsAt)
    next.timeOfDay = eventTime(next.startsAt, next.endsAt);

  // 필수값과 해결되지 않은 장소 후보만 미확정으로 남긴다
  const values = {
    name: next.name?.trim(),
    type: next.type,
    startsAt: next.startsAt,
    endsAt: next.endsAt,
    venue: next.ambiguities.some((item) => item.field === "venue")
      ? null
      : next.venueText?.trim(),
  };
  next.missing = (Object.keys(values) as (keyof typeof values)[]).filter(
    (key) => !values[key],
  );
  const questions: {
    field: string;
    question: string;
    options: { label: string; value: string }[];
  }[] = draftQuestions(next)
    .filter(({ field }) => !["startsAt", "endsAt"].includes(field))
    .map((question) => ({
      ...question,
      field: question.field === "venue" ? "venueText" : question.field,
      options:
        question.field === "hostType"
          ? ["지자체", "민간", "대학", "기타"].map((value) => ({
              label: value,
              value,
            }))
          : (next.ambiguities.find((item) => item.field === question.field)
              ?.candidates ?? []),
    }));
  if (!next.startsAt || !next.endsAt)
    questions.push({
      field: "time",
      question: "행사의 시작·종료 날짜와 시각을 함께 입력해 주세요.",
      options: [],
    });
  if (
    next.startsAt &&
    next.endsAt &&
    Date.parse(next.endsAt) <= Date.parse(next.startsAt)
  ) {
    questions.push({
      field: "time",
      question: "종료 일시는 시작 일시 뒤로 입력해 주세요.",
      options: [],
    });
  }
  return { draft: next, questions, ignoredFields };
}
