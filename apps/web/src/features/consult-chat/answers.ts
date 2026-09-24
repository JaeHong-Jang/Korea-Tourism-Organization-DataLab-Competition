// 되묻기 입력을 게이트웨이가 받는 행사 초안 부분 객체로 바꾼다.
import type { EventDraft } from "@crowdcast/contracts/types";

export type Ask = {
  field: string;
  question: string;
  options: { label: string; value: string }[];
};

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
