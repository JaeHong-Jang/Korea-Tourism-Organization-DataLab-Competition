// 오늘과 개최 D-14 중 이른 한국 날짜를 예보·평시 조회의 기준일로 쓴다
import { addDays } from "./normalize/date.js";

// 다른 오프셋의 직접 입력도 한국 개최일로 정규화해 누수 기준을 맞춘다
export function asOfDate(startsAt: string, now = new Date()) {
  const koreanDate = new Date(Date.parse(startsAt) + 9 * 60 * 60 * 1_000)
    .toISOString()
    .slice(0, 10);
  const today = new Date(now.getTime() + 9 * 60 * 60 * 1_000)
    .toISOString()
    .slice(0, 10);
  const cutoff = addDays(koreanDate, -14);
  return today < cutoff ? today : cutoff;
}
