// 행사별 군중을 겹침 없는 동심원에 결정적으로 배치한다.
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

// 작은 격자에 이미 배치한 인형을 기록해 행사 간 겹침을 빠르게 찾는다.
function crowdOccupancy() {
  const cells = new Map<string, Array<[number, number]>>();
  const key = (x: number, z: number) => `${x},${z}`;
  return {
    add(x: number, z: number) {
      const cell = key(Math.floor(x), Math.floor(z));
      const points = cells.get(cell) ?? [];
      points.push([x, z]);
      cells.set(cell, points);
    },
    hasNeighbor(x: number, z: number) {
      const cx = Math.floor(x);
      const cz = Math.floor(z);
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) {
          for (const [px, pz] of cells.get(key(cx + dx, cz + dz)) ?? []) {
            if ((px - x) ** 2 + (pz - z) ** 2 < 0.9 ** 2) return true;
          }
        }
      return false;
    },
  };
}

// 링이 다른 행사 군중과 닿으면 반경을 키워 동심원 형태를 유지한다.
export function buildDollLayout(
  placed: PlacedFestival[],
  counts: number[],
): DollInstance[] {
  const result: DollInstance[] = [];
  const occupancy = crowdOccupancy();
  const orientation = new Quaternion();
  const size = new Vector3(1, 1, 1);
  const position = new Vector3();
  placed.forEach(({ festival, x, y, z }, festivalIndex) => {
    let remaining = counts[festivalIndex] ?? 0;
    let dollIndex = 0;
    let radius = 5;
    while (remaining > 0) {
      const count = Math.min(
        remaining,
        Math.floor((2 * Math.PI * radius) / 0.95),
      );
      const phase = (festivalIndex % 2) * 0.5;
      const ring: Array<[number, number]> = [];
      let clear = false;
      while (!clear) {
        ring.length = 0;
        clear = true;
        for (let slot = 0; slot < count; slot++) {
          const angle = (2 * Math.PI * (slot + phase)) / count;
          const px = x + radius * Math.cos(angle);
          const pz = z + radius * Math.sin(angle);
          if (
            occupancy.hasNeighbor(px, pz) ||
            placed.some(
              (other) =>
                other !== placed[festivalIndex] &&
                (other.x - px) ** 2 + (other.z - pz) ** 2 < 4.5 ** 2,
            )
          ) {
            clear = false;
            break;
          }
          ring.push([px, pz]);
        }
        if (!clear) radius += 1.05;
      }
      for (const [px, pz] of ring) {
        occupancy.add(px, pz);
        position.set(px, LAND_SURFACE_Y + y + 0.05, pz);
        result.push({
          matrix: new Matrix4().compose(position, orientation, size),
          colorIndex: dollColorIndex(festival.eventId, dollIndex++),
        });
      }
      remaining -= count;
      radius += 1.05;
    }
  });
  return result;
}
