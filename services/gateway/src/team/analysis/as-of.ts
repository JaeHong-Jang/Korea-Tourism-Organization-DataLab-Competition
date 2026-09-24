// 개최일의 한국 날짜에서 D-14 기준일을 계산한다
import { addDays } from "./normalize/date.js";

// 다른 오프셋의 직접 입력도 한국 개최일로 정규화해 누수 기준을 맞춘다
export function asOfDate(startsAt: string) {
  const koreanDate = new Date(Date.parse(startsAt) + 9 * 60 * 60 * 1_000)
    .toISOString()
    .slice(0, 10);
  return addDays(koreanDate, -14);
}
