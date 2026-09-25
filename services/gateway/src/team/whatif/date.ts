// 행사일 기준 요일과 명시한 날짜를 해석하고 기존 행사 길이를 보존한다
import type { Event } from "@crowdcast/contracts/types";

const dayMs = 86_400_000;
const kstMs = 9 * 3_600_000;
const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

// UTC 계산 뒤 한국 시각으로 직렬화해 날짜 경계와 시차를 보존한다
export function koreanTimestamp(instant: number) {
  return `${new Date(instant + kstMs).toISOString().slice(0, 19)}+09:00`;
}

// 달력에 없는 날짜와 여러 날짜를 한 값으로 자동 정정하지 않는다
export function changedDate(text: string, event: Event, today: string) {
  const baseDay = koreanTimestamp(Date.parse(event.startsAt)).slice(0, 10);
  const iso = [...text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)];
  const korean = [
    ...text.matchAll(/(?:(\d{4})년\s*)?(\d{1,2})월\s*(\d{1,2})일/g),
  ];
  let target: string | undefined;
  if (iso.length + korean.length > 1) return undefined;
  if (iso.length || korean.length) {
    const match = iso[0] ?? korean[0];
    target = `${match[1] ?? baseDay.slice(0, 4)}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
    const time = Date.parse(`${target}T00:00:00Z`);
    if (
      !Number.isFinite(time) ||
      new Date(time).toISOString().slice(0, 10) !== target
    )
      return undefined;
  } else {
    const days = [...text.matchAll(/([일월화수목금토])요일/g)];
    if (days.length > 1) return undefined;
    if (/다음\s*주/.test(text) && !days.length) return undefined;
    const base = Date.parse(
      `${/내일|다음\s*주/.test(text) ? today : baseDay}T00:00:00Z`,
    );
    const day = new Date(base).getUTCDay();
    const delta = /내일/.test(text)
      ? 1
      : days.length
        ? /다음\s*주/.test(text)
          ? 7 - ((day + 6) % 7) + ((weekdays.indexOf(days[0][1]) + 6) % 7)
          : (weekdays.indexOf(days[0][1]) - day + 7) % 7
        : undefined;
    if (delta === undefined) return undefined;
    target = new Date(base + delta * dayMs).toISOString().slice(0, 10);
  }
  const offset = Date.parse(target) - Date.parse(baseDay);
  return {
    startsAt: koreanTimestamp(Date.parse(event.startsAt) + offset),
    endsAt: koreanTimestamp(Date.parse(event.endsAt) + offset),
  };
}

// 버튼은 기존 행사일 다음 날짜들을 명시해 상대 날짜의 해석을 줄인다
export function dateOptions(event: Event) {
  return [1, 7].map((days) => {
    const value = koreanTimestamp(
      Date.parse(event.startsAt) + days * dayMs,
    ).slice(0, 10);
    return { label: value, value };
  });
}
