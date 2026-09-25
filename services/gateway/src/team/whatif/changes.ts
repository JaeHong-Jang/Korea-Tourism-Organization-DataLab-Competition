// 허용된 조건 하나만 바꾸고 모호한 값은 계약의 선택 질문으로 돌려준다
import type { Event } from "@crowdcast/contracts/types";
import type { TeamMessage } from "../analysis/draft-answer.js";
import { changedDate, dateOptions } from "./date.js";
import type { WhatifKind } from "./intent.js";

export type WhatifChanges = Partial<
  Pick<Event, "startsAt" | "endsAt" | "timeOfDay" | "fee" | "type" | "hazards">
>;
export type WhatifQuestion = {
  field: string;
  question: string;
  options: { label: string; value: string }[];
};
const values = {
  time: ["주간", "야간", "종일"],
  fee: ["무료", "유료"],
  type: ["불꽃", "공연", "대학", "먹거리", "꽃", "전통", "기타"],
};

// 질문에 해당하는 필드만 답으로 받아 장소·위험요소 등 다른 값을 바꾸지 않는다
export function resolveChanges(
  kind: WhatifKind | undefined,
  message: TeamMessage,
  event: Event,
  today: string,
  answering: boolean,
): { changes: WhatifChanges; label: string } | { ask: WhatifQuestion } {
  if (!kind || kind === "weather" || kind === "similar")
    return {
      ask: {
        field: "whatif",
        question: "어떤 조건을 바꿔 볼까요?",
        options: ["날짜 변경", "시간대 변경", "요금 변경", "유형 변경"].map(
          (value) => ({ label: value, value }),
        ),
      },
    };
  if (kind === "date") {
    const startsAt = answering ? message.answer?.startsAt : undefined;
    const endsAt = answering ? message.answer?.endsAt : undefined;
    const changes =
      startsAt && endsAt
        ? { startsAt, endsAt }
        : startsAt
          ? changedDate(startsAt.slice(0, 10), event, today)
          : changedDate(message.text, event, today);
    if (changes && Date.parse(changes.endsAt) > Date.parse(changes.startsAt))
      return { changes, label: "요청한 날짜" };
    return {
      ask: {
        field: "startsAt",
        question:
          "어느 날짜로 바꿀까요? 요일만 말씀하시면 기존 행사일 이후의 해당 요일로 옮겨요.",
        options: dateOptions(event),
      },
    };
  }

  // 부정·선택 표현은 명시적인 버튼 답이 없는 한 사용자의 결정을 기다린다
  const field = kind === "time" ? "timeOfDay" : kind;
  const answer = answering ? message.answer?.[field] : undefined;
  const text =
    kind === "time"
      ? message.text.replace(/저녁|밤/g, "야간").replace(/낮/g, "주간")
      : message.text;
  const matches = values[kind].filter((value) => {
    if (kind === "type" && value === "꽃" && text.includes("불꽃"))
      return false;
    return text.includes(value);
  });
  const selected =
    typeof answer === "string" && values[kind].includes(answer)
      ? answer
      : matches.length === 1 && !/말고|아니|않|또는|말면/.test(text)
        ? matches[0]
        : undefined;
  if (selected) return { changes: { [field]: selected }, label: selected };
  return {
    ask: {
      field,
      question: `${kind === "time" ? "어느 시간대" : kind === "fee" ? "어떤 요금 조건" : "어떤 행사 유형"}로 바꿀까요?`,
      options: values[kind].map((value) => ({ label: value, value })),
    },
  };
}
