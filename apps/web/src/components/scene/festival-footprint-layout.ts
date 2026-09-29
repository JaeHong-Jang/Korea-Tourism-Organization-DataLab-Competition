// 가까운 축제끼리 바닥 테두리가 겹치지 않도록 표시 반경을 정한다.
import type { PlacedFestival } from "./festival-models/placement";

// 인접 모형과의 간격을 남기고 단독 축제도 같은 최대 크기로 표시한다.
export function festivalFootprintRadii(placed: PlacedFestival[]): number[] {
  return placed.map((festival, index) => {
    let radius = 9;
    for (let otherIndex = 0; otherIndex < placed.length; otherIndex++) {
      if (otherIndex === index) continue;
      const other = placed[otherIndex];
      const distance = Math.hypot(festival.x - other.x, festival.z - other.z);
      radius = Math.min(radius, Math.max(0, distance / 2 - 0.6));
    }
    return radius;
  });
}
