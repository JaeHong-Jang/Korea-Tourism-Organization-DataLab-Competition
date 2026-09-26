// 가까운 행사 모형을 결정적으로 밀어 내 장면에서 서로 구별한다.
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
  const occupied: Array<[number, number]> = [];
  const maximum = totals ? Math.max(0, ...totals.values()) : 0;
  return [...festivals]
    .sort((a, b) => a.eventId.localeCompare(b.eventId))
    .map((festival) => {
      const [originX, originZ] = projectKorea(festival.lng, festival.lat);
      let x = originX;
      let z = originZ;
      for (
        let attempt = 0;
        attempt < 40 &&
        occupied.some(([px, pz]) => Math.hypot(px - x, pz - z) < 14);
        attempt++
      ) {
        const angle = attempt * 2.399963229728653;
        const radius = 8 + Math.sqrt(attempt + 1) * 7;
        x = originX + Math.cos(angle) * radius;
        z = originZ + Math.sin(angle) * radius;
      }
      occupied.push([x, z]);
      const y = totals
        ? (tileStep(totals.get(festival.sigunguCode) ?? 0, maximum) - 1) * 2.5
        : 0;
      return { festival, x, y, z };
    });
}
