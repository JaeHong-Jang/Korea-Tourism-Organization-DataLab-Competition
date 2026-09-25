// 시군구 경계에서 가장 큰 땅 조각 안쪽의 대표점·반지름(km)·외곽선을 구한다 — 도시 건물 무리를 바다에 세우지 않게.
import type { MultiPolygon, Polygon } from "geojson";
import { insidePolygon } from "./city/free-space";
import { projectKorea } from "./projection";

export type LandAnchor = {
  x: number;
  z: number;
  radius: number;
  ring: [number, number][];
  name: string;
};

// 신발끈 공식의 부호 있는 넓이와 무게중심.
function centroid(ring: [number, number][]) {
  let area = 0;
  let x = 0;
  let z = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    area += cross;
    x += (ring[j][0] + ring[i][0]) * cross;
    z += (ring[j][1] + ring[i][1]) * cross;
  }
  area /= 2;
  return {
    area: Math.abs(area),
    x: x / (6 * area || 1),
    z: z / (6 * area || 1),
  };
}

// 무게중심이 땅 밖(초승달 모양·섬)이면 10×10 격자에서 안쪽이면서 무게중심에 가장 가까운 점을 쓴다.
export function landAnchor(
  geometry: Polygon | MultiPolygon,
  name: string,
): LandAnchor | null {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let best: {
    ring: [number, number][];
    area: number;
    x: number;
    z: number;
  } | null = null;
  for (const rings of polygons) {
    if (!rings[0] || rings[0].length < 4) continue;
    const ring = rings[0].map(([longitude, latitude]) =>
      projectKorea(longitude, latitude),
    );
    const center = centroid(ring);
    if (!best || center.area > best.area) best = { ring, ...center };
  }
  if (!best) return null;
  const radius = Math.sqrt(best.area / Math.PI);
  const { ring } = best;
  if (insidePolygon(best.x, best.z, ring))
    return { x: best.x, z: best.z, radius, ring, name };
  const xs = ring.map(([x]) => x);
  const zs = ring.map(([, z]) => z);
  const minX = Math.min(...xs);
  const minZ = Math.min(...zs);
  const stepX = (Math.max(...xs) - minX) / 10;
  const stepZ = (Math.max(...zs) - minZ) / 10;
  let pick: [number, number] = ring[0];
  let nearest = Infinity;
  for (let i = 0; i <= 10; i++)
    for (let j = 0; j <= 10; j++) {
      const x = minX + stepX * i;
      const z = minZ + stepZ * j;
      const distance = Math.hypot(x - best.x, z - best.z);
      if (distance < nearest && insidePolygon(x, z, ring)) {
        nearest = distance;
        pick = [x, z];
      }
    }
  return { x: pick[0], z: pick[1], radius, ring, name };
}
