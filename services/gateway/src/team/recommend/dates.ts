// 방문객의 한국 날짜 표현을 KST 달력의 양끝 포함 검색 기간으로 바꾼다
import { addDays, normalizeDates } from "../analysis/normalize/date.js";

export type DateRange = { from: string; to: string };

// 월 길이를 달력에서 구해 연말·윤년에도 검색 종료일이 유효하게 한다
function monthRange(year: number, month: number): DateRange {
  const from = new Date(Date.UTC(year, month - 1, 1))
    .toISOString()
    .slice(0, 10);
  const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { from, to };
}

// ICU의 한국 음력으로 추석 전날부터 다음 날까지를 찾아 고정 양력 날짜를 피한다
function chuseok(year: number): DateRange {
  const calendar = new Intl.DateTimeFormat("en-u-ca-dangi", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
  });
  for (
    let day = `${year}-08-01`;
    day <= `${year}-10-31`;
    day = addDays(day, 1)
  ) {
    const parts = calendar.formatToParts(new Date(`${day}T12:00:00+09:00`));
    if (
      parts.find((part) => part.type === "month")?.value === "8" &&
      parts.find((part) => part.type === "day")?.value === "15"
    )
      return { from: addDays(day, -1), to: addDays(day, 1) };
  }
  throw new Error("한국 음력 달력을 사용할 수 없습니다");
}

// 구체적인 날짜·기간을 먼저 읽고 표현이 없으면 오늘부터 기본 기간을 조회한다
export function recommendationDates(text: string, today: string): DateRange {
  const compact = text.replace(/\s+/g, "");
  const [year, month] = today.split("-").map(Number);
  const explicit = compact.match(
    /(?:\d{4}년)?\d{1,2}월\d{1,2}일(?:(?:부터|~|–|-)(?:(?:\d{4}년)?\d{1,2}월)?\d{1,2}일(?:까지)?)?|\d{4}-\d{2}-\d{2}/,
  )?.[0];
  if (explicit) {
    const range = normalizeDates(explicit, today);
    if (range.start && range.end) return { from: range.start, to: range.end };
  }
  if (compact.includes("추석")) {
    const target = compact.match(/(\d{4})년/)?.[1];
    const range = chuseok(
      target ? Number(target) : year + (compact.includes("내년") ? 1 : 0),
    );
    return !target && !compact.includes("올해") && range.to < today
      ? chuseok(year + 1)
      : range;
  }
  // 주간은 월요일 시작이며 일요일의 이번 주말은 오늘까지 포함한다
  const week = compact.match(/(이번|다음)주(말|[월화수목금토일]요일)?/);
  if (week) {
    const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
    const monday = addDays(today, -weekday + (week[1] === "다음" ? 7 : 0));
    if (week[2]?.endsWith("요일")) {
      const day = addDays(monday, "월화수목금토일".indexOf(week[2][0]));
      return { from: day, to: day };
    }
    const from = addDays(monday, week[2] === "말" ? 5 : 0);
    return {
      from: week[1] === "이번" && from < today ? today : from,
      to: addDays(monday, 6),
    };
  }
  const relative = compact.match(/오늘|내일|모레/);
  if (relative) {
    const day = addDays(today, { 오늘: 0, 내일: 1, 모레: 2 }[relative[0]] ?? 0);
    return { from: day, to: day };
  }
  if (/이번달|다음달/.test(compact)) {
    const range = monthRange(
      year,
      month + (compact.includes("다음달") ? 1 : 0),
    );
    return { from: range.from < today ? today : range.from, to: range.to };
  }
  const namedMonth = compact.match(/(?:(\d{4})년)?(\d{1,2})월/);
  if (namedMonth && Number(namedMonth[2]) >= 1 && Number(namedMonth[2]) <= 12) {
    const target = Number(namedMonth[2]);
    const range = monthRange(
      namedMonth[1] ? Number(namedMonth[1]) : year + (target < month ? 1 : 0),
      target,
    );
    return {
      from: range.from < today && range.to >= today ? today : range.from,
      to: range.to,
    };
  }
  return { from: today, to: addDays(today, 30) };
}
