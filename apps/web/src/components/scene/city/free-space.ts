// 건물 외곽선 안쪽인지 빠르게 묻는 격자 색인 — 나무·모인 사람을 건물 속에 두지 않게 한다.
import type { Point } from "../venue/coordinates";
import type { VenueBuilding } from "../venue/tiles";

const CELL = 40;

// 점이 다각형 안에 있는지(짝홀 규칙).
export function insidePolygon(x: number, z: number, ring: Point[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[j];
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax)
      inside = !inside;
  }
  return inside;
}

// 외곽선마다 걸치는 격자 칸에 등록하고, 물을 때는 그 칸의 건물만 검사한다.
export function buildingIndex(buildings: VenueBuilding[]) {
  const cells = new Map<string, Point[][]>();
  for (const building of buildings) {
    const ring = building.footprint;
    if (!ring || ring.length < 3) continue;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of ring) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++)
      for (
        let cz = Math.floor(minZ / CELL);
        cz <= Math.floor(maxZ / CELL);
        cz++
      ) {
        const key = `${cx},${cz}`;
        const list = cells.get(key) ?? [];
        list.push(ring);
        cells.set(key, list);
      }
  }
  // 여유(margin) 안에 건물 벽이 있으면 막힌 자리로 본다(네 방향 점 검사).
  return (x: number, z: number, margin = 0) => {
    for (const [dx, dz] of [
      [0, 0],
      [margin, 0],
      [-margin, 0],
      [0, margin],
      [0, -margin],
    ]) {
      const px = x + dx;
      const pz = z + dz;
      const list = cells.get(
        `${Math.floor(px / CELL)},${Math.floor(pz / CELL)}`,
      );
      if (list?.some((ring) => insidePolygon(px, pz, ring))) return true;
    }
    return false;
  };
}

// 같은 동네에는 늘 같은 배치가 나오도록 고정 씨앗 난수를 쓴다.
export function seededRandom(seed: number) {
  let value = seed % 2147483647 || 1;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}
