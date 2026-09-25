// 전국 장면에서 고른 행사 좌표의 현재 날씨를 읽고 기본 좌표는 서울로 둔다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { useWeather } from "../../../lib/use-weather";

// 목록의 선택이 바뀌면 같은 시각의 새 장소 날씨로 교체한다.
export function useSceneWeather(
  festivals: FestivalSummary[],
  selectedId: string | null,
  at: Date,
) {
  const festival = festivals.find((item) => item.eventId === selectedId);
  return useWeather(festival?.lat ?? 37.5665, festival?.lng ?? 126.978, at);
}
