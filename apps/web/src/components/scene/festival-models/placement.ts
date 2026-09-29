// 행사 좌표를 그대로 투영해 확대 지점과 실제 건물 위치를 일치시킨다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { tileStep } from "../../../features/mini-korea/data-mode";
import { projectKorea } from "../projection";

export type PlacedFestival = {
  festival: FestivalSummary;
  x: number;
  y: number;
  z: number;
};

// 행사 ID 순서로 배치해 입력 목록 순서가 바뀌어도 같은 위치를 만든다.
export function placeFestivals(
  festivals: FestivalSummary[],
  totals: Map<string, number> | null = null,
): PlacedFestival[] {
  const maximum = totals ? Math.max(0, ...totals.values()) : 0;
  return [...festivals]
    .sort((a, b) => a.eventId.localeCompare(b.eventId))
    .map((festival) => {
      const [originX, originZ] = projectKorea(festival.lng, festival.lat);
      const x = originX;
      const z = originZ;
      const y = totals
        ? (tileStep(totals.get(festival.sigunguCode) ?? 0, maximum) - 1) * 2.5
        : 0;
      return { festival, x, y, z };
    });
}
