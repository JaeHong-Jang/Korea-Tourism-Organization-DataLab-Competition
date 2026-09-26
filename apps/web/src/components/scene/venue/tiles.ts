// PMTiles의 주변 z15 벡터 타일에서 실제 건물·길·철도·역·지표를 읽는다.
import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";
import { PMTiles } from "pmtiles";
import { clipPolygon, clipSegment } from "./clip";
import type { Point } from "./coordinates";
import { nearbyTiles, tilePointToVenue } from "./coordinates";
import type { VenueKey } from "./sites";
import {
  buildingHeight,
  isStationName,
  roadWidth,
  ZONE_KINDS,
} from "./tile-tags";

export type VenueBuilding = {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  minHeight: number;
  // 실제 건물 외곽선(동·남 미터) — 동네 3D가 상자 대신 이 모양으로 세운다.
  footprint?: Point[];
  // 높이·층수 태그가 없어 기본 높이를 쓴 건물 — 동네 3D가 종류에 맞춰 높이를 추정한다.
  guessed?: boolean;
};
export type VenueLine = { from: Point; to: Point; kind: string; width: number };
export type VenueArea = { points: Point[]; kind: "water" | "park" };
// 건물 종류 추정에 쓰는 토지이용 구역(주거·상업·학교·공업).
export type VenueZone = {
  points: Point[];
  kind: "residential" | "commercial" | "school" | "industrial";
};
export type VenueStation = { point: Point; name: string };
export type VenueTiles = {
  buildings: VenueBuilding[];
  roads: VenueLine[];
  rails: VenueLine[];
  areas: VenueArea[];
  stations: VenueStation[];
  zones?: VenueZone[];
};

const archives = new Map<string, PMTiles>();

// 역점은 해당 타일이 소유한 좌표만 받아 중복 라벨을 막는다.
function insideTile(point: Point, extent: number): boolean {
  return (
    point[0] >= 0 && point[0] < extent && point[1] >= 0 && point[1] < extent
  );
}

// 타일 하나의 레이어를 경계로 잘라 중심에서 1.2km 안의 조각만 모은다.
export function readVenueTile(
  data: ArrayBuffer,
  x: number,
  y: number,
  center: Point,
  into: VenueTiles,
): void {
  const tile = new VectorTile(new Pbf(data));
  const project = (point: Point) => tilePointToVenue(point, x, y, center);
  const nearby = (point: Point) => Math.hypot(point[0], point[1]) <= 1250;
  const buildings = tile.layers.buildings;
  if (buildings)
    for (let index = 0; index < buildings.length; index++) {
      const feature = buildings.feature(index);
      if (feature.type !== 3 || feature.properties.kind === "address") continue;
      const ring = clipPolygon(
        feature
          .loadGeometry()[0]
          ?.map(({ x: px, y: py }) => [px, py] as Point) ?? [],
        buildings.extent,
      );
      if (ring.length < 3) continue;
      const points = ring.map(project);
      const xs = points.map((point) => point[0]);
      const zs = points.map((point) => point[1]);
      const minX = Math.min(...xs),
        maxX = Math.max(...xs),
        minZ = Math.min(...zs),
        maxZ = Math.max(...zs);
      const centerPoint: Point = [(minX + maxX) / 2, (minZ + maxZ) / 2];
      if (!nearby(centerPoint) || maxX - minX < 0.4 || maxZ - minZ < 0.4)
        continue;
      const [height, minHeight] = buildingHeight(feature.properties);
      const tags = feature.properties;
      into.buildings.push({
        guessed:
          tags.height === undefined &&
          tags["building:levels"] === undefined &&
          tags.levels === undefined,
        x: centerPoint[0],
        z: centerPoint[1],
        width: maxX - minX,
        depth: maxZ - minZ,
        height,
        minHeight,
        footprint: points,
      });
    }

  // roads 레이어의 rail은 선로로 분리하고, 연속 선의 모든 선분을 소유 타일에만 둔다.
  const roads = tile.layers.roads;
  if (roads)
    for (let index = 0; index < roads.length; index++) {
      const feature = roads.feature(index);
      if (feature.type !== 2) continue;
      const kind = String(feature.properties.kind ?? "path");
      if (!["major_road", "minor_road", "path", "rail"].includes(kind))
        continue;
      for (const line of feature.loadGeometry())
        for (let step = 1; step < line.length; step++) {
          const cut = clipSegment(
            [line[step - 1].x, line[step - 1].y],
            [line[step].x, line[step].y],
            roads.extent,
          );
          if (!cut) continue;
          const from = project(cut[0]),
            to = project(cut[1]);
          if (
            Math.hypot(to[0] - from[0], to[1] - from[1]) < 0.3 ||
            !nearby([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2])
          )
            continue;
          (kind === "rail" ? into.rails : into.roads).push({
            from,
            to,
            kind,
            width: roadWidth(kind),
          });
        }
    }

  // 수면과 공원은 지도 위의 납작한 면으로 단순화한다.
  for (const layerName of ["water", "landuse"] as const) {
    const layer = tile.layers[layerName];
    if (!layer) continue;
    for (let index = 0; index < layer.length; index++) {
      const feature = layer.feature(index);
      const zone =
        layerName === "landuse"
          ? ZONE_KINDS[String(feature.properties.kind)]
          : undefined;
      if (
        feature.type !== 3 ||
        (layerName === "landuse" &&
          !zone &&
          !["park", "grass", "forest", "garden"].includes(
            String(feature.properties.kind),
          ))
      )
        continue;
      const ring = clipPolygon(
        feature
          .loadGeometry()[0]
          ?.map(({ x: px, y: py }) => [px, py] as Point) ?? [],
        layer.extent,
      );
      if (ring.length < 3) continue;
      const points = ring.map(project);
      // 구역은 꼭짓점이 멀어도 안쪽 건물을 덮을 수 있어 거리로 거르지 않는다.
      if (zone) {
        if (!into.zones) into.zones = [];
        into.zones.push({ points, kind: zone });
        continue;
      }
      if (points.some(nearby))
        into.areas.push({
          points,
          kind: layerName === "water" ? "water" : "park",
        });
    }
  }

  // 공개 POI의 역만 표시하며 버스 정류장은 철도역으로 해석하지 않는다.
  const pois = tile.layers.pois;
  if (pois)
    for (let index = 0; index < pois.length; index++) {
      const feature = pois.feature(index);
      if (feature.type !== 1 || feature.properties.kind !== "station") continue;
      const name = String(
        feature.properties["name:ko"] ?? feature.properties.name ?? "",
      );
      if (!isStationName(name)) continue;
      const point = feature.loadGeometry()[0]?.[0];
      if (!point || !insideTile([point.x, point.y], pois.extent)) continue;
      const projected = project([point.x, point.y]);
      if (nearby(projected))
        into.stations.push({
          point: projected,
          name,
        });
    }
}

// 같은 PMTiles 인스턴스의 범위 캐시를 재사용하고 요청 취소를 다음 타일 전에 확인한다.
export async function loadVenueTiles(
  key: VenueKey,
  center: Point,
  signal?: AbortSignal,
): Promise<VenueTiles> {
  let archive = archives.get(key);
  if (!archive) {
    archive = new PMTiles(`/tiles/venue-${key}-z15.pmtiles`);
    archives.set(key, archive);
  }
  const result: VenueTiles = {
    buildings: [],
    roads: [],
    rails: [],
    areas: [],
    stations: [],
  };
  for (const [x, y] of nearbyTiles(center[0], center[1])) {
    signal?.throwIfAborted();
    const tile = await archive.getZxy(15, x, y, signal);
    if (tile) readVenueTile(tile.data, x, y, center, result);
  }
  result.buildings.sort(
    (a, b) => a.x * a.x + a.z * a.z - b.x * b.x - b.z * b.z,
  );
  return result;
}

// 저장소에 든 행사·시군구 중심 둘레 z15 타일을 먼저 읽고, 그 밖 좌표면(내 행사 등) 로컬에 전국 z15 원본이 있을 때만 거기서 읽는다(동네 3D, 반경 약 1.2km).
const CITY_ARCHIVES = [
  "/tiles/korea-z15-festivals.pmtiles",
  "/tiles/korea-z15.pmtiles",
];

export async function loadCityTiles(
  center: Point,
  signal?: AbortSignal,
): Promise<VenueTiles> {
  const result: VenueTiles = {
    buildings: [],
    roads: [],
    rails: [],
    areas: [],
    stations: [],
  };
  for (const url of CITY_ARCHIVES) {
    let archive = archives.get(url);
    if (!archive) {
      archive = new PMTiles(url);
      archives.set(url, archive);
    }
    const source = archive;
    // 원본 파일이 없으면(다른 사람 컴퓨터) 빈 결과로 둔다.
    const tiles = await Promise.all(
      nearbyTiles(center[0], center[1]).map(async ([x, y]) => {
        signal?.throwIfAborted();
        return [x, y, await source.getZxy(15, x, y, signal)] as const;
      }),
    ).catch((error: unknown) => {
      if (signal?.aborted) throw error;
      return [];
    });
    if (!tiles.some(([, , tile]) => tile)) continue;
    for (const [x, y, tile] of tiles)
      if (tile) readVenueTile(tile.data, x, y, center, result);
    break;
  }
  result.buildings.sort(
    (a, b) => a.x * a.x + a.z * a.z - b.x * b.x - b.z * b.z,
  );
  return result;
}
