// 화면에서 보이지 않을 만큼 작은 토지 피복 면·도로와 촘촘한 꼭짓점을 걸러 삼각형 수를 줄인다.
import type { MapArea, MapPoint, MapRoad } from "./types";

// 화면 폭(지도 좌표)을 이 수로 나눈 길이를 "약 2픽셀"로 본다.
const PIXEL_DIVISOR = 700;

// 링 꼭짓점 사이가 최소 길이보다 가까우면 건너뛰어 모양은 유지하고 꼭짓점만 줄인다.
function thinRing(ring: MapPoint[], min: number): MapPoint[] {
  if (ring.length <= 4) return ring;
  const kept: MapPoint[] = [ring[0]];
  for (let i = 1; i < ring.length - 1; i++) {
    const last = kept[kept.length - 1];
    if (Math.hypot(ring[i][0] - last[0], ring[i][1] - last[1]) >= min)
      kept.push(ring[i]);
  }
  kept.push(ring[ring.length - 1]);
  return kept.length >= 4 ? kept : ring;
}

// 외곽 상자의 대각선 길이로 면 크기를 잰다.
function extent(ring: MapPoint[]): number {
  let minX = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const [x, z] of ring) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return Math.hypot(maxX - minX, maxZ - minZ);
}

// 화면 폭 기준으로 2픽셀보다 작은 면·구멍은 빼고, 남은 링은 꼭짓점 간격을 1픽셀 이상으로 줄인다.
export function visibleAreas(areas: MapArea[], viewWidth: number): MapArea[] {
  const min = viewWidth / PIXEL_DIVISOR;
  const result: MapArea[] = [];
  for (const area of areas) {
    const polygons = area.polygons
      .filter((rings) => rings[0] && extent(rings[0]) >= min)
      .map((rings) => [
        thinRing(rings[0], min / 2),
        ...rings
          .slice(1)
          .filter((hole) => extent(hole) >= min)
          .map((hole) => thinRing(hole, min / 2)),
      ]);
    if (polygons.length) result.push({ kind: area.kind, polygons });
  }
  return result;
}

// 도로 선은 양 끝을 남기고 1픽셀보다 가까운 중간 점을 건너뛰며, 전체가 2픽셀보다 작은 도로는 뺀다.
export function visibleRoads(roads: MapRoad[], viewWidth: number): MapRoad[] {
  const min = viewWidth / PIXEL_DIVISOR;
  const result: MapRoad[] = [];
  for (const road of roads) {
    if (road.points.length < 2 || extent(road.points) < min) continue;
    const points: MapPoint[] = [road.points[0]];
    for (let i = 1; i < road.points.length - 1; i++) {
      const last = points[points.length - 1];
      if (
        Math.hypot(road.points[i][0] - last[0], road.points[i][1] - last[1]) >=
        min / 2
      )
        points.push(road.points[i]);
    }
    points.push(road.points[road.points.length - 1]);
    result.push(
      points.length === road.points.length ? road : { ...road, points },
    );
  }
  return result;
}
