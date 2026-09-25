// 건물 종류(아파트·오피스·빌라·주택·상가·학교·공장)를 토지이용 구역·높이·바닥 모양·큰길 거리로 추정한다(연출).
import type { Point } from "../venue/coordinates";
import type { VenueBuilding, VenueLine, VenueZone } from "../venue/tiles";
import { insidePolygon } from "./free-space";

export const BUILDING_KINDS = [
  "apartment",
  "office",
  "villa",
  "house",
  "shop",
  "school",
  "factory",
] as const;
export type BuildingKind = (typeof BUILDING_KINDS)[number];

// 가장 긴 변을 축으로 잡은 둘레 사각형 — 지붕·옥탑·간판 방향과 크기를 정한다.
export type Frame = {
  ux: number;
  uz: number;
  angle: number;
  cx: number;
  cz: number;
  length: number;
  width: number;
  area: number;
};
export type StyledBuilding = VenueBuilding & {
  kind: BuildingKind;
  frame: Frame;
};

// 같은 건물은 늘 같은 값을 갖도록 좌표와 소금값으로 만든 결정적 0~1 값.
export function jitter(building: { x: number; z: number }, salt = 0) {
  const value =
    Math.sin(building.x * 12.9898 + building.z * 78.233 + salt * 37.719) *
    43758.5453;
  return value - Math.floor(value);
}

// 외곽선을 가장 긴 변 방향(u)과 그 수직(v)으로 투영해 둘레 사각형과 넓이(신발끈 공식)를 구한다.
export function footprintFrame(ring: Point[]): Frame {
  let best = 0;
  let angle = 0;
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const dx = ring[i][0] - ring[j][0];
    const dz = ring[i][1] - ring[j][1];
    const length = Math.hypot(dx, dz);
    if (length > best) {
      best = length;
      angle = Math.atan2(dz, dx);
    }
    area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  const ux = Math.cos(angle);
  const uz = Math.sin(angle);
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const [x, z] of ring) {
    const u = x * ux + z * uz;
    const v = -x * uz + z * ux;
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }
  const u = (minU + maxU) / 2;
  const v = (minV + maxV) / 2;
  return {
    ux,
    uz,
    angle,
    cx: u * ux - v * uz,
    cz: u * uz + v * ux,
    length: maxU - minU,
    width: maxV - minV,
    area: Math.abs(area) / 2,
  };
}

const CELL = 80;

// 구역과 큰길을 격자 칸에 넣어 두고, 건물 중심이 어느 구역인지·큰길가인지 묻는다.
export function kindContext(zones: VenueZone[], roads: VenueLine[]) {
  const zoneCells = new Map<string, VenueZone[]>();
  const roadCells = new Map<string, VenueLine[]>();
  const add = <T>(
    cells: Map<string, T[]>,
    item: T,
    xs: number[],
    zs: number[],
    margin = 0,
  ) => {
    for (
      let cx = Math.floor((Math.min(...xs) - margin) / CELL);
      cx <= Math.floor((Math.max(...xs) + margin) / CELL);
      cx++
    )
      for (
        let cz = Math.floor((Math.min(...zs) - margin) / CELL);
        cz <= Math.floor((Math.max(...zs) + margin) / CELL);
        cz++
      ) {
        const key = `${cx},${cz}`;
        const list = cells.get(key) ?? [];
        list.push(item);
        cells.set(key, list);
      }
  };
  for (const zone of zones)
    add(
      zoneCells,
      zone,
      zone.points.map(([x]) => x),
      zone.points.map(([, z]) => z),
    );
  for (const road of roads)
    if (road.kind === "major_road")
      add(
        roadCells,
        road,
        [road.from[0], road.to[0]],
        [road.from[1], road.to[1]],
        30,
      );
  const key = (x: number, z: number) =>
    `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  // 학교·공업·상업을 주거보다 먼저 본다(주거 구역 안의 학교를 학교로).
  const order: VenueZone["kind"][] = [
    "school",
    "industrial",
    "commercial",
    "residential",
  ];
  return {
    zoneAt(x: number, z: number): VenueZone["kind"] | null {
      const inside = (zoneCells.get(key(x, z)) ?? []).filter((zone) =>
        insidePolygon(x, z, zone.points),
      );
      return (
        order.find((kind) => inside.some((item) => item.kind === kind)) ?? null
      );
    },
    // 큰길 선분까지 거리가 28m 안이면 길가 건물로 본다.
    nearMajor(x: number, z: number) {
      return (roadCells.get(key(x, z)) ?? []).some(({ from, to }) => {
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
        return Math.hypot(from[0] + dx * t - x, from[1] + dz * t - z) < 28;
      });
    },
  };
}

// 높이(태그가 있을 때)·구역·넓이·길가 여부로 종류를 고른다.
export function buildingKind(
  building: VenueBuilding,
  frame: Frame,
  context: ReturnType<typeof kindContext>,
): BuildingKind {
  const zone = context.zoneAt(building.x, building.z);
  const road = context.nearMajor(building.x, building.z);
  const pick = jitter(building, 1);
  if (zone === "school") return "school";
  if (zone === "industrial") return frame.area > 300 ? "factory" : "villa";
  const tall = building.guessed
    ? zone === "residential" && frame.area > 350
    : building.height >= 28;
  if (tall) {
    if (zone === "residential") return "apartment";
    if (zone === "commercial" || road) return "office";
    return frame.width / Math.max(1, frame.length) < 0.5 || pick < 0.6
      ? "apartment"
      : "office";
  }
  if (zone === "commercial" || (road && frame.area < 1500)) return "shop";
  if (!building.guessed && building.height >= 16)
    return pick < 0.5 ? "shop" : "villa";
  if (frame.area < 160 && pick < 0.55) return "house";
  return frame.area > 1200 ? "shop" : "villa";
}

// 높이 태그가 없는 건물은 종류에 맞는 높이(m)로 추정하고, 태그가 있으면 그대로 쓴다.
export function kindHeight(building: VenueBuilding, kind: BuildingKind) {
  if (!building.guessed) return building.height;
  const t = jitter(building, 2);
  const [low, span] = {
    apartment: [36, 30],
    office: [30, 30],
    villa: [10, 4],
    house: [4.5, 2.5],
    shop: [7, 9],
    school: [12, 3],
    factory: [6, 4],
  }[kind];
  return low + t * span;
}

// 건물마다 종류(채운 건물은 정해 둔 종류)·둘레 사각형·추정 높이를 붙인다(외곽선 없는 건물은 뺀다).
export function styleBuildings(
  buildings: (VenueBuilding & { hint?: BuildingKind })[],
  zones: VenueZone[],
  roads: VenueLine[],
): StyledBuilding[] {
  const context = kindContext(zones, roads);
  const styled: StyledBuilding[] = [];
  for (const building of buildings) {
    if (!building.footprint || building.footprint.length < 3) continue;
    const frame = footprintFrame(building.footprint);
    const kind = building.hint ?? buildingKind(building, frame, context);
    styled.push({
      ...building,
      height: kindHeight(building, kind),
      kind,
      frame,
    });
  }
  return styled;
}
