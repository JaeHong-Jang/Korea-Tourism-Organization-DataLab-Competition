// OSM에 건물이 없는 길가를 한국 동네처럼 채운다 — 주거 구역은 아파트, 상업 구역·큰길가는 상가, 골목은 빌라·주택(연출).
import type { Point } from "../venue/coordinates";
import type { VenueBuilding, VenueLine, VenueTiles } from "../venue/tiles";
import { type BuildingKind, jitter, kindContext } from "./building-kind";
import { insidePolygon } from "./free-space";

// 채운 건물은 종류를 미리 정해 둔다(연출 표시용 staged).
export type FilledBuilding = VenueBuilding & {
  hint: BuildingKind;
  staged: true;
};

const CELL = 4;
const COARSE = 80;
const RADIUS = 1150;

// 4m 칸 점유 격자 — 행사 무대 자리와 먼저 채운 건물이 차지한 칸을 적는다.
function occupancy() {
  const cells = new Set<number>();
  const key = (x: number, z: number) =>
    (Math.floor(x / CELL) + 2000) * 4000 + (Math.floor(z / CELL) + 2000);
  // 중심·축·반폭으로 정한 사각형이 덮는 칸을 훑는다(mark면 적고, 아니면 빈지만 본다).
  const scan = (
    cx: number,
    cz: number,
    ux: number,
    uz: number,
    halfU: number,
    halfV: number,
    mark: boolean,
  ) => {
    for (let u = -halfU; u <= halfU; u += CELL / 2)
      for (let v = -halfV; v <= halfV; v += CELL / 2) {
        const cell = key(cx + u * ux - v * uz, cz + u * uz + v * ux);
        if (mark) cells.add(cell);
        else if (cells.has(cell)) return false;
      }
    return true;
  };
  return {
    free: (
      cx: number,
      cz: number,
      ux: number,
      uz: number,
      hu: number,
      hv: number,
    ) => scan(cx, cz, ux, uz, hu, hv, false),
    mark: (
      cx: number,
      cz: number,
      ux: number,
      uz: number,
      hu: number,
      hv: number,
    ) => {
      scan(cx, cz, ux, uz, hu, hv, true);
    },
  };
}

// 종류별 필지 크기(길 따라 폭·깊이)·길에서 물러난 거리·필지 사이 간격(m).
function lotFor(kind: BuildingKind, t: number) {
  switch (kind) {
    case "apartment":
      return { width: 42 + t * 26, depth: 13, setback: 12, gap: 16 };
    case "office":
      return { width: 24 + t * 12, depth: 20 + t * 8, setback: 6, gap: 8 };
    case "shop":
      return { width: 10 + t * 14, depth: 14 + t * 6, setback: 2, gap: 1.5 };
    case "house":
      return { width: 8 + t * 4, depth: 8 + t * 3, setback: 3, gap: 5 };
    default:
      return { width: 9 + t * 6, depth: 10 + t * 5, setback: 2, gap: 2.5 };
  }
}

// 종류별로 길에서 안쪽으로 채울 줄 수와 줄 사이 간격(m) — 아파트는 동 사이를 넓게 띄운다.
const ROWS: Record<BuildingKind, { count: number; gap: number }> = {
  apartment: { count: 3, gap: 26 },
  office: { count: 1, gap: 0 },
  villa: { count: 3, gap: 3 },
  shop: { count: 2, gap: 3 },
  house: { count: 2, gap: 6 },
  school: { count: 1, gap: 0 },
  factory: { count: 1, gap: 0 },
};

// 사각형 외곽선 네 꼭짓점(동·남 미터).
function rectangle(
  cx: number,
  cz: number,
  ux: number,
  uz: number,
  halfU: number,
  halfV: number,
): Point[] {
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([su, sv]) => [
    cx + su * halfU * ux - sv * halfV * uz,
    cz + su * halfU * uz + sv * halfV * ux,
  ]);
}

// 실제 건물이 있는 80m 칸과 그 이웃은 채우지 않는다(자료가 있는 곳의 실제 배치를 지킨다).
function coveredCells(buildings: VenueBuilding[]) {
  const covered = new Set<string>();
  for (const { x, z } of buildings) {
    const cx = Math.floor(x / COARSE);
    const cz = Math.floor(z / COARSE);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) covered.add(`${cx + dx},${cz + dz}`);
  }
  return (x: number, z: number) =>
    covered.has(`${Math.floor(x / COARSE)},${Math.floor(z / COARSE)}`);
}

// 길·철길 선분을 40m 칸에 넣어 두고, 점들이 모두 길 폭 밖(0.5m 여유)에 있는지 묻는다.
function roadClearance(lines: VenueLine[]) {
  const cells = new Map<string, VenueLine[]>();
  for (const line of lines) {
    const minX = Math.floor(Math.min(line.from[0], line.to[0]) / 40);
    const maxX = Math.floor(Math.max(line.from[0], line.to[0]) / 40);
    const minZ = Math.floor(Math.min(line.from[1], line.to[1]) / 40);
    const maxZ = Math.floor(Math.max(line.from[1], line.to[1]) / 40);
    for (let cx = minX - 1; cx <= maxX + 1; cx++)
      for (let cz = minZ - 1; cz <= maxZ + 1; cz++) {
        const list = cells.get(`${cx},${cz}`) ?? [];
        list.push(line);
        cells.set(`${cx},${cz}`, list);
      }
  }
  return (points: Point[]) =>
    points.every(([x, z]) =>
      (cells.get(`${Math.floor(x / 40)},${Math.floor(z / 40)}`) ?? []).every(
        ({ from, to, kind, width }) => {
          const dx = to[0] - from[0];
          const dz = to[1] - from[1];
          const t = Math.max(
            0,
            Math.min(
              1,
              ((x - from[0]) * dx + (z - from[1]) * dz) /
                (dx * dx + dz * dz || 1),
            ),
          );
          const gap = Math.hypot(from[0] + dx * t - x, from[1] + dz * t - z);
          return gap > (kind === "rail" ? 6 : width) / 2 + 0.5;
        },
      ),
    );
}

// 길 선분 양쪽으로 필지를 이어 붙여 limit채까지 채운다(행사장에 가까운 길부터).
export function fillBuildings(
  tiles: VenueTiles,
  limit: number,
): FilledBuilding[] {
  if (limit <= 0) return [];
  const grid = occupancy();
  const context = kindContext(tiles.zones ?? [], tiles.roads);
  const covered = coveredCells(tiles.buildings);
  // 행사 무대 자리는 40m 반경을 막아 둔다.
  grid.mark(0, 0, 1, 0, 40, 40);
  const clear = roadClearance([...tiles.roads, ...tiles.rails]);
  const water = tiles.areas.filter((area) => area.kind === "water");
  // 찻길 밀도(km/km², 보행로 제외)가 4 아래인 시골은 주택 마을만 둔다(안면도 2.3·파주 운정 5.2·강남 20).
  const carKm =
    tiles.roads
      .filter((line) => line.kind !== "path")
      .reduce(
        (sum, line) =>
          sum +
          Math.hypot(line.to[0] - line.from[0], line.to[1] - line.from[1]),
        0,
      ) / 1000;
  const rural = carKm / (Math.PI * 1.25 ** 2) < 4;
  const segments = tiles.roads
    .filter((line) => line.kind !== "path")
    .map((line) => ({
      line,
      distance: Math.hypot(
        (line.from[0] + line.to[0]) / 2,
        (line.from[1] + line.to[1]) / 2,
      ),
    }))
    .sort((a, b) => a.distance - b.distance);
  const filled: FilledBuilding[] = [];
  for (const { line } of segments) {
    const dx = line.to[0] - line.from[0];
    const dz = line.to[1] - line.from[1];
    const length = Math.hypot(dx, dz);
    if (length < 3) continue;
    const ux = dx / length;
    const uz = dz / length;
    for (const side of [-1, 1]) {
      let along = 0;
      while (along < length && filled.length < limit) {
        // 종류는 길 위가 아니라 필지 쪽(길 가장자리에서 8m 안) 점의 구역으로 정한다.
        const inward = line.width / 2 + 8;
        const seed = {
          x: line.from[0] + ux * along - side * uz * inward,
          z: line.from[1] + uz * along + side * ux * inward,
        };
        const t = jitter(seed, 11);
        const zone = context.zoneAt(seed.x, seed.z);
        const kind: BuildingKind =
          zone === "residential"
            ? "apartment"
            : zone === "commercial"
              ? t < 0.15
                ? "office"
                : "shop"
              : rural
                ? "house"
                : line.kind === "major_road"
                  ? "shop"
                  : t < 0.2
                    ? "house"
                    : "villa";
        // 길가 첫 줄 뒤로 블록 안쪽까지 줄을 더 채운다(큰길 상가 뒤는 빌라 골목).
        const front = lotFor(kind, jitter(seed, 12));
        along += front.width + front.gap;
        let depth = line.width / 2 + front.setback;
        for (let row = 0; row < ROWS[kind].count; row++) {
          const rowKind = row > 0 && kind === "shop" ? "villa" : kind;
          const lot =
            row === 0 ? front : lotFor(rowKind, jitter(seed, 12 + row));
          const offset = depth + lot.depth / 2;
          depth += lot.depth + ROWS[kind].gap;
          const shift = along - front.gap - front.width / 2;
          const cx = line.from[0] + ux * shift - side * uz * offset;
          const cz = line.from[1] + uz * shift + side * ux * offset;
          // 시골은 150m 칸마다 마을 여부를 정해 마을 칸에만 모아 짓고 나머지는 드문드문 둔다.
          const village =
            jitter({ x: Math.floor(cx / 150), z: Math.floor(cz / 150) }, 21) >
            0.6;
          const chance = rural
            ? village
              ? 0.7
              : 0.05
            : rowKind === "house"
              ? 0.6
              : 0.88 - row * 0.12;
          if (
            Math.hypot(cx, cz) > RADIUS ||
            covered(cx, cz) ||
            (rowKind === "apartment" &&
              context.zoneAt(cx, cz) !== "residential") ||
            jitter(seed, 13 + row) > chance ||
            water.some((area) => insidePolygon(cx, cz, area.points)) ||
            !grid.free(cx, cz, ux, uz, lot.width / 2 + 1, lot.depth / 2 + 1)
          )
            break;
          const footprint = rectangle(
            cx,
            cz,
            ux,
            uz,
            lot.width / 2,
            lot.depth / 2,
          );
          if (!clear([...footprint, [cx, cz]])) break;
          grid.mark(cx, cz, ux, uz, lot.width / 2 + 1, lot.depth / 2 + 1);
          filled.push({
            x: cx,
            z: cz,
            width: lot.width,
            depth: lot.depth,
            height: 9,
            minHeight: 0,
            footprint,
            guessed: true,
            hint: rowKind,
            staged: true,
          });
        }
      }
    }
    if (filled.length >= limit) break;
  }
  return filled;
}
