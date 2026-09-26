// 확인한 시작·종료 시각으로 행사 시간대를 결정한다
import type { EventDraft } from "@crowdcast/contracts/types";

export const TIME_RULE = {
  nightStartHour: 17,
  allDayStartBefore: 12,
  allDayEndAfter: 18,
} as const;

// 입력 오프셋과 무관하게 한국 현지 시각으로 같은 규칙을 적용한다
export function eventTime(
  startsAt: string,
  endsAt: string,
): EventDraft["timeOfDay"] {
  const start = new Date(Date.parse(startsAt) + 9 * 60 * 60 * 1000);
  const end = new Date(Date.parse(endsAt) + 9 * 60 * 60 * 1000);
  const startHour =
    start.getUTCHours() +
    start.getUTCMinutes() / 60 +
    start.getUTCSeconds() / 3600;
  const endHour =
    end.getUTCHours() + end.getUTCMinutes() / 60 + end.getUTCSeconds() / 3600;
  const endsLaterDay =
    end.toISOString().slice(0, 10) > start.toISOString().slice(0, 10);
  if (startHour >= TIME_RULE.nightStartHour) return "야간";
  if (
    startHour < TIME_RULE.allDayStartBefore &&
    (endsLaterDay || endHour > TIME_RULE.allDayEndAfter)
  )
    return "종일";
  return "주간";
}
