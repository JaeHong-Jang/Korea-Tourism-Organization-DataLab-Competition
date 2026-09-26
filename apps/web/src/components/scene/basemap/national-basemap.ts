// 전국 지도 타일(z0~8 묶음 중 z7)에서 실제 토지 피복(도시·숲·농지)·호수·고속도로·주요 도로를 읽어 전국 판 좌표(km)로 바꾼다.
import { VectorTile } from "@mapbox/vector-tile";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import Pbf from "pbf";
import { PMTiles } from "pmtiles";
import { insidePolygon } from "../city/free-space";
import { projectKorea } from "../projection";

export type Point2 = [number, number];
export type BaseArea = { kind: string; rings: Point2[][] };
export type BaseLine = { kind: string; points: Point2[] };
export type Basemap = {
  areas: BaseArea[];
  water: BaseArea[];
  roads: BaseLine[];
};

const ZOOM = 7;
// 토지 피복 종류 → 전국 판 칠 종류(나머지 땅은 기본 녹회색).
const COVER: Record<string, string> = {
  urban_area: "urban",
  forest: "forest",
  farmland: "farm",
  grassland: "grass",
  scrub: "grass",
};
const WATER = new Set(["water", "lake", "reservoir", "river", "basin"]);
const ROADS = new Set(["highway", "major_road"]);

// 점과 선분 사이 거리(더글러스–퍼커 단순화용).
function gap(point: Point2, a: Point2, b: Point2) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) /
        (dx * dx + dz * dz || 1),
    ),
  );
  return Math.hypot(a[0] + dx * t - point[0], a[1] + dz * t - point[1]);
}

// 허용 오차(km) 안에서 점을 줄인다 — 전국 판에서는 0.5km 안팎의 굴곡이 거의 보이지 않는다(점이 적을수록 프레임이 가볍다).
export function simplify(points: Point2[], tolerance: number): Point2[] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop() as [number, number];
    let far = -1;
    let most = tolerance;
    for (let index = first + 1; index < last; index++) {
      const distance = gap(points[index], points[first], points[last]);
      if (distance > most) {
        most = distance;
        far = index;
      }
    }
    if (far > 0) {
      keep[far] = 1;
      stack.push([first, far], [far, last]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

const project = (ring: number[][], tolerance: number) =>
  simplify(
    ring.map(([longitude, latitude]) => projectKorea(longitude, latitude)),
    tolerance,
  );

// 폴리곤·멀티폴리곤을 외곽선+구멍 묶음 목록으로 펼친다(점이 셋 미만인 고리는 버린다).
function polygons(
  feature: Feature,
  kind: string,
  tolerance: number,
): BaseArea[] {
  const geometry = feature.geometry as Polygon | MultiPolygon;
  const list =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates
        : [];
  return list
    .map((rings) => ({
      kind,
      rings: rings
        .map((ring) => project(ring, tolerance))
        .filter((ring) => ring.length >= 3),
    }))
    .filter((area) => area.rings.length > 0);
}

// 한국 경위도 범위를 덮는 z7 타일을 모두 읽는다(약 9장·1.3MB, 저장소의 korea-z8.pmtiles).
export async function loadNationalBasemap(
  signal?: AbortSignal,
): Promise<Basemap> {
  const archive = new PMTiles("/tiles/korea-z8.pmtiles");
  const n = 2 ** ZOOM;
  const tileX = (longitude: number) =>
    Math.floor(((longitude + 180) / 360) * n);
  const tileY = (latitude: number) => {
    const rad = (latitude * Math.PI) / 180;
    return Math.floor(
      ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
    );
  };
  const jobs: Promise<Basemap>[] = [];
  for (let x = tileX(124.3); x <= tileX(131.2); x++)
    for (let y = tileY(38.8); y <= tileY(32.9); y++)
      jobs.push(
        archive.getZxy(ZOOM, x, y, signal).then((tile) => {
          const part: Basemap = { areas: [], water: [], roads: [] };
          if (!tile) return part;
          const layers = new VectorTile(new Pbf(tile.data)).layers;
          const each = (
            name: string,
            visit: (feature: Feature, kind: string) => void,
          ) => {
            const layer = layers[name];
            if (!layer) return;
            for (let index = 0; index < layer.length; index++) {
              const feature = layer.feature(index);
              visit(
                feature.toGeoJSON(x, y, ZOOM),
                String(feature.properties.kind ?? ""),
              );
            }
          };
          each("landcover", (feature, kind) => {
            if (COVER[kind])
              part.areas.push(...polygons(feature, COVER[kind], 0.6));
          });
          each("water", (feature, kind) => {
            if (WATER.has(kind))
              part.water.push(...polygons(feature, "water", 0.3));
          });
          each("roads", (feature, kind) => {
            if (!ROADS.has(kind)) return;
            const geometry = feature.geometry;
            const lines =
              geometry.type === "LineString"
                ? [geometry.coordinates]
                : geometry.type === "MultiLineString"
                  ? geometry.coordinates
                  : [];
            for (const line of lines) {
              const points = project(line, 0.5);
              if (points.length >= 2) part.roads.push({ kind, points });
            }
          });
          return part;
        }),
      );
  const parts = await Promise.all(jobs);
  return {
    areas: parts.flatMap((part) => part.areas),
    water: parts.flatMap((part) => part.water),
    roads: parts.flatMap((part) => part.roads),
  };
}

// 남한 시군구 땅 안(가운데 점 기준)의 피복·호수·도로만 남긴다 — z7 타일에 걸친 일본·북한 땅을 판 밖에 그리지 않게.
export function withinLand(
  basemap: Basemap,
  anchors: Map<string, { ring: Point2[] }>,
): Basemap {
  const boxes = [...anchors.values()].map(({ ring }) => {
    const xs = ring.map(([x]) => x);
    const zs = ring.map(([, z]) => z);
    return {
      ring,
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
    };
  });
  const inside = ([x, z]: Point2) =>
    boxes.some(
      (box) =>
        x >= box.minX &&
        x <= box.maxX &&
        z >= box.minZ &&
        z <= box.maxZ &&
        insidePolygon(x, z, box.ring),
    );
  // 큰 피복 조각은 가운데가 바다일 수 있어 점 몇 개를 표본으로 본다.
  const touches = (points: Point2[]) => {
    const step = Math.max(1, Math.floor(points.length / 12));
    for (let index = 0; index < points.length; index += step)
      if (inside(points[index])) return true;
    return false;
  };
  return {
    areas: basemap.areas.filter((area) => touches(area.rings[0])),
    water: basemap.water.filter((area) => touches(area.rings[0])),
    roads: basemap.roads.filter((road) => touches(road.points)),
  };
}
