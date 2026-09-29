// 벡터 타일 버퍼를 소유 타일 안으로 잘라 중복 도로·면·건물 조각을 막는다.
import type { Geometry } from "geojson";
import { projectKorea } from "../projection";
import { clipPolygon, clipSegment } from "../venue/clip";
import { mapTileAt } from "./tile-plan";
import type { MapPoint } from "./types";

// 경위도를 타일 좌표로 자른 뒤 동일한 전국 km 투영으로 돌려놓는다.
export function tileProjection(x: number, y: number, zoom: number) {
  const extent = 4096,
    n = 2 ** zoom;
  const local = ([lng, lat]: number[]): MapPoint => {
    const [tx, ty] = mapTileAt(lng, lat, zoom);
    return [(tx - x) * extent, (ty - y) * extent];
  };
  const world = ([px, py]: MapPoint): MapPoint =>
    projectKorea(
      ((x + px / extent) / n) * 360 - 180,
      (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + py / extent)) / n))) *
        180) /
        Math.PI,
    );
  return { extent, local, world };
}

// 외곽과 모든 내부 고리를 함께 유지하고 면적 없는 경계 조각은 제거한다.
export function ownedPolygons(
  geometry: Geometry,
  x: number,
  y: number,
  zoom: number,
): MapPoint[][][] {
  const groups =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates
        : [];
  const projection = tileProjection(x, y, zoom);
  const result: MapPoint[][][] = [];
  for (const group of groups) {
    const rings = group
      .map((ring) => clipPolygon(ring.map(projection.local), projection.extent))
      .map((ring) => {
        const area = Math.abs(
          ring.reduce((sum, p, i) => {
            const q = ring[(i + 1) % ring.length];
            return sum + p[0] * q[1] - p[1] * q[0];
          }, 0),
        );
        return area > 0.001
          ? [...ring.map(projection.world), projection.world(ring[0])]
          : [];
      });
    if (rings[0]?.length >= 4)
      result.push([
        rings[0],
        ...rings.slice(1).filter((ring) => ring.length >= 4),
      ]);
  }
  return result;
}

// 도로의 각 선분을 경계에 정확히 맞춰 이웃 타일에 같은 길을 두 번 그리지 않는다.
export function ownedLines(
  geometry: Geometry,
  x: number,
  y: number,
  zoom: number,
): MapPoint[][] {
  const lines =
    geometry.type === "LineString"
      ? [geometry.coordinates]
      : geometry.type === "MultiLineString"
        ? geometry.coordinates
        : [];
  const projection = tileProjection(x, y, zoom),
    result: MapPoint[][] = [];
  for (const line of lines)
    for (let i = 1; i < line.length; i++) {
      const segment = clipSegment(
        projection.local(line[i - 1]),
        projection.local(line[i]),
        projection.extent,
      );
      if (
        segment &&
        Math.hypot(
          segment[1][0] - segment[0][0],
          segment[1][1] - segment[0][1],
        ) > 0.001
      )
        result.push(segment.map(projection.world));
    }
  return result;
}
