// 행사 고르기 목록: 곧 열리는 행사를 가까운 날짜 순으로 먼저, 끝난 행사는 뒤에 두고 검색어로만 좁힌다.
import type { FestivalSummary } from "@crowdcast/contracts/types";

const DAY = 86_400_000;

// 한국 날짜 기준 남은 날을 "지난 행사·진행 중·오늘·D-n"으로 읽는다.
export function dDayLabel(festival: FestivalSummary, now: Date): string {
  const start = Date.parse(festival.startsAt);
  const end = Date.parse(festival.endsAt);
  if (end < now.getTime()) return "지난 행사";
  if (start <= now.getTime()) return "진행 중";
  const kstDay = (time: number) => Math.floor((time + 9 * 3_600_000) / DAY);
  const days = kstDay(start) - kstDay(now.getTime());
  return days <= 0 ? "오늘" : `D-${days}`;
}

// 검색어가 없으면 가장 가까운 행사부터, 있으면 이름·지역·날짜가 맞는 행사만 같은 순서로 준다.
export function soonestFestivals(
  festivals: FestivalSummary[],
  query: string,
  now: Date,
  limit: number,
): FestivalSummary[] {
  const text = query.trim().toLocaleLowerCase("ko-KR");
  const ended = (festival: FestivalSummary) =>
    Date.parse(festival.endsAt) < now.getTime();
  return festivals
    .filter(
      (festival) =>
        !text ||
        `${festival.name} ${festival.sigunguName} ${festival.startsAt.slice(0, 10)}`
          .toLocaleLowerCase("ko-KR")
          .includes(text),
    )
    .sort(
      (a, b) =>
        Number(ended(a)) - Number(ended(b)) ||
        (ended(a)
          ? Date.parse(b.startsAt) - Date.parse(a.startsAt)
          : Date.parse(a.startsAt) - Date.parse(b.startsAt)),
    )
    .slice(0, limit);
}
