// 행사 시각을 한국 표준시로 읽고 시간대와 자정 경과를 계산한다
import type { EventDraft } from "@crowdcast/contracts/types";

export type EventHours = {
  start: string | null;
  end: string | null;
  nextDay: boolean;
  timeOfDay: EventDraft["timeOfDay"];
};

// 오전·오후 표현과 24시간 표기를 분 단위로 검증한다
function minutes(
  hourText: string,
  minuteText: string | undefined,
  marker: string | undefined,
): number | null {
  let hour = Number(hourText);
  const minute = Number(minuteText || 0);
  if (marker && (hour < 1 || hour > 12)) return null;
  if (marker) hour = (hour % 12) + (/오후|저녁|밤/.test(marker) ? 12 : 0);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

// ISO 시간 조각은 초까지 채워 날짜 조각과 안전하게 합친다
function clock(value: number | null): string | null {
  return value === null
    ? null
    : `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}:00`;
}

// 명시된 시각만 사용하고 주간·야간 같은 넓은 표현에 임의의 시간을 넣지 않는다
export function normalizeTime(text: string | null): EventHours {
  const empty: EventHours = {
    start: null,
    end: null,
    nextDay: false,
    timeOfDay: null,
  };
  if (!text) return empty;
  const matches = [
    ...text.matchAll(
      /(오전|오후|아침|저녁|밤|새벽)?\s*(\d{1,2})(?::(\d{1,2})|시(?:\s*(\d{1,2})분)?|(?=\s*[~–-]))/g,
    ),
  ];
  if (!matches.length)
    return {
      ...empty,
      timeOfDay: /종일|하루\s*종일/.test(text)
        ? "종일"
        : /야간|저녁|밤/.test(text)
          ? "야간"
          : /주간|낮/.test(text)
            ? "주간"
            : null,
    };
  if (matches.length > 2 || /반/.test(text)) return empty;
  const [first, second] = matches;
  const start = minutes(first[2], first[3] || first[4], first[1]);
  const end = second
    ? minutes(
        second[2],
        second[3] || second[4],
        second[1] || (Number(second[2]) <= 12 ? first[1] : undefined),
      )
    : null;
  if (start === null || (second && end === null)) return empty;

  // 종료가 시작보다 빠르면 자정 경과로 처리하고 같은 시각은 기간 확인으로 돌린다
  const nextDay = end !== null && (end < start || /다음\s*날|익일/.test(text));
  const night = start >= 18 * 60 || start < 6 * 60;
  const timeOfDay =
    nextDay || (end !== null && !night && end > 18 * 60)
      ? night && end !== null && end <= 6 * 60
        ? "야간"
        : "종일"
      : night
        ? "야간"
        : "주간";
  return {
    start: clock(start),
    end: end === start ? null : clock(end),
    nextDay,
    timeOfDay,
  };
}
