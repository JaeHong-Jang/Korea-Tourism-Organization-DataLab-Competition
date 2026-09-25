// 발행된 행사 조건에 맞는 what-if 질문과 후속 질문을 고른다.
import type { EventDraft } from "@crowdcast/contracts/types";

// 현재 날짜·시각·요금을 뒤집는 질문은 이미 적용된 조건을 되묻지 않는다.
export function whatIfChips(draft: EventDraft | null): string[] {
  const weekday = draft?.startsAt
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Seoul",
        weekday: "short",
      }).format(new Date(draft.startsAt))
    : null;
  return [
    weekday === "Sun" ? "토요일이면?" : "일요일이면?",
    draft?.timeOfDay === "야간" ? "낮이면?" : "밤이면?",
    draft?.fee === "유료" ? "무료면?" : "유료면?",
    "비 오면?",
    "비슷한 행사는?",
  ];
}
