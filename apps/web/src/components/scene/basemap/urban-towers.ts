// 실제 지도의 도시 지역(토지 피복 urban_area) 안을 흰 건물로 채운다 — 건물이 시군구 대표점 둘레에만 뭉치지 않고 실제 시가지 모양을 따라 퍼지게(건물 하나하나는 연출).

import { insidePolygon, seededRandom } from "../city/free-space";
import type { Tower } from "../city-clusters";
import type { BaseArea, Basemap, Point2 } from "./national-basemap";

// 격자 간격·건물 크기·높이(km, 전국 판에서 보이게 과장).
const GRID = 0.9;
const SIZE = [0.38, 0.7] as const;
const LOW = [0.3, 1.0] as const;
const TALL = [1.2, 2.4] as const;
// 도로 띠·행사 표시 자리에서 띄울 거리(km).
const ROAD_CLEAR = 0.45;
const AVOID_CLEAR = 2;
const CELL = 2;

type Box = {
  area: BaseArea;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

const boxOf = (area: BaseArea): Box => {
  const xs = area.rings[0].map(([x]) => x);
  const zs = area.rings[0].map(([, z]) => z);
  return {
    area,
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
};

// 외곽선 안이면서 구멍 밖인지.
const insideArea = (x: number, z: number, box: Box) =>
  x >= box.minX &&
  x <= box.maxX &&
  z >= box.minZ &&
  z <= box.maxZ &&
  insidePolygon(x, z, box.area.rings[0]) &&
  !box.area.rings.slice(1).some((hole) => insidePolygon(x, z, hole));

// 도로 선분을 2km 칸에 나눠 담아 가까운 선분만 거리 검사한다.
function roadIndex(roads: Basemap["roads"]) {
  const cells = new Map<string, [Point2, Point2][]>();
  for (const road of roads)
    for (let index = 1; index < road.points.length; index++) {
      const a = road.points[index - 1];
      const b = road.points[index];
      const x0 = Math.floor(Math.min(a[0], b[0]) / CELL);
      const x1 = Math.floor(Math.max(a[0], b[0]) / CELL);
      const z0 = Math.floor(Math.min(a[1], b[1]) / CELL);
      const z1 = Math.floor(Math.max(a[1], b[1]) / CELL);
      for (let cx = x0; cx <= x1; cx++)
        for (let cz = z0; cz <= z1; cz++) {
          const key = `${cx}:${cz}`;
          const list = cells.get(key) ?? [];
          list.push([a, b]);
          cells.set(key, list);
        }
    }
  return (x: number, z: number) => {
    const list = cells.get(`${Math.floor(x / CELL)}:${Math.floor(z / CELL)}`);
    return (
      list?.some(([a, b]) => {
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const t = Math.max(
          0,
          Math.min(
            1,
            ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1),
          ),
        );
        return Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z) < ROAD_CLEAR;
      }) ?? false
    );
  };
}

// 도시 지역마다 0.9km 격자점을 흔들어 건물을 세운다(물·도로·행사 자리는 비움, 품질에 따라 일부만).
export function urbanTowers(
  basemap: Basemap,
  avoid: [number, number][],
  share: number,
): Tower[] {
  const random = seededRandom(9173);
  const nearRoad = roadIndex(basemap.roads);
  const water = basemap.water.map(boxOf);
  const towers: Tower[] = [];
  for (const box of basemap.areas
    .filter((area) => area.kind === "urban")
    .map(boxOf))
    for (let x = Math.ceil(box.minX / GRID) * GRID; x <= box.maxX; x += GRID)
      for (
        let z = Math.ceil(box.minZ / GRID) * GRID;
        z <= box.maxZ;
        z += GRID
      ) {
        const px = x + (random() - 0.5) * GRID * 0.6;
        const pz = z + (random() - 0.5) * GRID * 0.6;
        const tall = random() < 0.12;
        const [low, high] = tall ? TALL : LOW;
        const height = low + random() * (high - low);
        const tone = random();
        if (
          random() > share ||
          !insideArea(px, pz, box) ||
          water.some((pond) => insideArea(px, pz, pond)) ||
          nearRoad(px, pz) ||
          avoid.some(([ax, az]) => Math.hypot(ax - px, az - pz) < AVOID_CLEAR)
        )
          continue;
        towers.push({
          x: px,
          z: pz,
          width: SIZE[0] + random() * (SIZE[1] - SIZE[0]),
          depth: SIZE[0] + random() * (SIZE[1] - SIZE[0]),
          height,
          tone,
        });
      }
  return towers;
}
