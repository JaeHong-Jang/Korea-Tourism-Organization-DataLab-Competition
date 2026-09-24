// 인형의 고정 위치와 옷 색을 행사 ID로부터 재현한다.
import { Matrix4, Quaternion, Vector3 } from "three";
import type { PlacedFestival } from "../festival-models/placement";
import { LAND_SURFACE_Y } from "../scene-height";

export type DollInstance = { matrix: Matrix4; colorIndex: number };

// 같은 행사와 순번은 목록 정렬이나 리렌더에 관계없이 같은 옷 색을 가진다.
export function dollColorIndex(eventId: string, index: number): number {
  let hash = 2166136261;
  for (let offset = 0; offset < eventId.length; offset++)
    hash = Math.imul(hash ^ eventId.charCodeAt(offset), 16777619);
  return ((hash ^ Math.imul(index + 1, 2654435761)) >>> 0) % 8;
}

// 모형에서 5km 떨어진 동심원에 약 0.9km 이상 간격으로 인형을 세운다.
export function buildDollLayout(
  placed: PlacedFestival[],
  counts: number[],
): DollInstance[] {
  const result: DollInstance[] = [];
  const orientation = new Quaternion();
  const size = new Vector3(1, 1, 1);
  const position = new Vector3();
  placed.forEach(({ festival, x, z }, festivalIndex) => {
    let remaining = counts[festivalIndex] ?? 0;
    let dollIndex = 0;
    let ring = 0;
    while (remaining > 0) {
      const radius = 5 + ring * 1.05;
      const count = Math.min(
        remaining,
        Math.floor((2 * Math.PI * radius) / 0.95),
      );
      for (let slot = 0; slot < count; slot++) {
        const angle =
          (2 * Math.PI * (slot + (ring % 2) * 0.5)) /
          Math.floor((2 * Math.PI * radius) / 0.95);
        position.set(
          x + radius * Math.cos(angle),
          LAND_SURFACE_Y + 0.05,
          z + radius * Math.sin(angle),
        );
        result.push({
          matrix: new Matrix4().compose(position, orientation, size),
          colorIndex: dollColorIndex(festival.eventId, dollIndex++),
        });
      }
      remaining -= count;
      ring++;
    }
  });
  return result;
}
