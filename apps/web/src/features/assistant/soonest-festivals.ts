// 행사 고르기 목록: 아직 끝나지 않은 행사를 가까운 날짜 순으로 두고 검색어로만 좁힌다.
import type { FestivalSummary } from "@crowdcast/contracts/types";

const DAY = 86_400_000;

// 한국 날짜 기준 남은 날을 "진행 중·오늘·D-n"으로 읽는다.
export function dDayLabel(festival: FestivalSummary, now: Date): string {
  const start = Date.parse(festival.startsAt);
  const end = Date.parse(festival.endsAt);
  if (start <= now.getTime() && now.getTime() <= end) return "진행 중";
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
  return festivals
    .filter((festival) => Date.parse(festival.endsAt) >= now.getTime())
    .filter(
      (festival) =>
        !text ||
        `${festival.name} ${festival.sigunguName} ${festival.startsAt.slice(0, 10)}`
          .toLocaleLowerCase("ko-KR")
          .includes(text),
    )
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .slice(0, limit);
}
