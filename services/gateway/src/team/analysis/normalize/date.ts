// 기준일과 한국어 날짜 표현을 달력 검증을 거친 행사 날짜로 바꾼다
const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const ordinals = ["첫째", "둘째", "셋째", "넷째", "다섯째"];

// 실제 날짜와 데모 기준일을 한국 표준시의 달력 날짜로 통일한다
export function todayInKorea(env: NodeJS.ProcessEnv = process.env): string {
  const today =
    env.CROWDCAST_TODAY ||
    new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(today) ||
    !calendarDate(...dateParts(today))
  ) {
    throw new Error("CROWDCAST_TODAY는 유효한 YYYY-MM-DD여야 합니다");
  }
  return today;
}

// ISO 달력 날짜의 연·월·일을 날짜 계산에 넘긴다
function dateParts(value: string): [number, number, number] {
  const [year, month, day] = value.split("-").map(Number);
  return [year, month, day];
}

// Date의 월말 자동 이월을 금지해 존재하지 않는 날짜를 거부한다
function calendarDate(year: number, month: number, day: number): string | null {
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1)
    return null;
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year &&
    value.getUTCMonth() === month - 1 &&
    value.getUTCDate() === day
    ? value.toISOString().slice(0, 10)
    : null;
}

// 상대 일수와 야간 행사 종료일을 월말·연말 경계에서도 계산한다
export function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// 상대 일·주 표현 전체가 일치해야 계산해 알 수 없는 수식어를 버리지 않는다
function relativeDay(text: string, today: string): string | null {
  // 다음 주는 월요일 시작 주간으로 고정해 실행 요일에 따라 뜻이 달라지지 않게 한다
  const week = text.match(/^(이번|다음)주([일월화수목금토])요일$/);
  if (week) {
    const current = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
    const desired = (weekdays.indexOf(week[2]) + 6) % 7;
    return addDays(today, desired - current + (week[1] === "다음" ? 7 : 0));
  }
  if (text === "모레") return addDays(today, 2);
  if (text === "내일") return addDays(today, 1);
  if (text === "오늘") return today;
  return null;
}

// 연·월 지시어와 일자 또는 월의 몇 번째 요일을 하나의 표현으로 해석한다
function singleDate(text: string, today: string): string | null {
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return calendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const relative = relativeDay(text, today);
  if (relative) return relative;
  const parts = text.match(
    /^(?:(\d{4})년|(올해|내년))?(?:(\d{1,2})월|(이번달|다음달))?(?:(\d{1,2})일|(첫째|둘째|셋째|넷째|다섯째|[1-5])(?:주|번째)([일월화수목금토])요일)$/,
  );
  if (!parts) return null;
  const [
    ,
    explicitYear,
    yearWord,
    explicitMonth,
    monthWord,
    day,
    nth,
    weekday,
  ] = parts;
  // 서로 다른 기준을 섞거나 월 없이 일자만 제시한 표현은 되묻는다
  if (
    ((explicitYear || yearWord) && !explicitMonth) ||
    (day && !explicitMonth && !monthWord)
  )
    return null;
  const [baseYear, baseMonth] = dateParts(today);
  let year = explicitYear
    ? Number(explicitYear)
    : baseYear + (yearWord === "내년" ? 1 : 0);
  let month = explicitMonth ? Number(explicitMonth) : baseMonth;
  if (monthWord === "다음달") {
    month = (baseMonth % 12) + 1;
    year += baseMonth === 12 ? 1 : 0;
  }
  if (!calendarDate(year, month, 1)) return null;
  if (day) return calendarDate(year, month, Number(day));

  // 둘째 주 토요일은 해당 월의 두 번째 토요일이며 존재하지 않는 다섯째는 보류한다
  const ordinal = /\d/.test(nth) ? Number(nth) : ordinals.indexOf(nth) + 1;
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return calendarDate(
    year,
    month,
    1 +
      ((weekdays.indexOf(weekday) - firstWeekday + 7) % 7) +
      (ordinal - 1) * 7,
  );
}

// 월·연도가 생략된 종료일은 시작일을 기준으로 해석하되 역전 기간은 거부한다
export function normalizeDates(
  text: string | null,
  today: string,
  timeText?: string | null,
): { start: string | null; end: string | null } {
  const empty = { start: null, end: null };
  if (!text) return empty;
  // 모델이 날짜 필드에 함께 복사한 시각은 검증된 시각 원문과 일치할 때만 분리한다
  const compact = text.replace(/\s+/g, "");
  const time = timeText?.replace(/\s+/g, "");
  const dateText =
    time && compact.includes(time)
      ? compact.replace(time, "").replace(/까지$/, "")
      : compact;
  const range = dateText.match(/^(.+?)(?:부터|~|–|(?<=일)-)(.+?)(?:까지)?$/);
  if (!range) {
    const start = singleDate(dateText, today);
    return { start, end: start };
  }
  // 범위는 명시적인 달력 날짜만 지원하고 상대 날짜가 섞이면 확인을 요청한다
  if (/올해|내년|이번|다음|오늘|내일|모레|요일/.test(dateText)) return empty;
  const start = singleDate(range[1], today);
  if (!start) return empty;
  const [year, month] = dateParts(start);
  const endDay = range[2].match(/^(\d{1,2})일$/);
  const end = endDay
    ? calendarDate(year, month, Number(endDay[1]))
    : singleDate(range[2], start);
  return end && end >= start ? { start, end } : empty;
}
