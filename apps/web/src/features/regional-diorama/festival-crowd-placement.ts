// 축제 좌표 주변의 건물·차도·수면을 피해 연출용 관람객 자리를 정한다.
import {
  buildingIndex,
  insidePolygon,
  seededRandom,
} from "../../components/scene/city/free-space";
import type { Point } from "../../components/scene/venue/coordinates";
import type { VenueLine, VenueTiles } from "../../components/scene/venue/tiles";

// 선분 끝과 굽은 도로에서도 차도까지의 실제 최단 거리를 구한다.
export function distanceToRoad(x: number, z: number, road: VenueLine) {
  const dx = road.to[0] - road.from[0];
  const dz = road.to[1] - road.from[1];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((x - road.from[0]) * dx + (z - road.from[1]) * dz) /
        (dx * dx + dz * dz || 1),
    ),
  );
  return Math.hypot(x - road.from[0] - dx * t, z - road.from[1] - dz * t);
}

// 빈 공간이 적으면 인원을 줄이며 실제 축제 위치를 다른 곳으로 옮기지 않는다.
export function festivalCrowdPositions(
  tiles: VenueTiles,
  center: Point,
): Point[] {
  const blocked = crowdBlocked(tiles, center);
  const random = seededRandom(8713);
  const positions: Point[] = [];
  for (let i = 0; i < 6000 && positions.length < 360; i++) {
    const spread = i % 4 === 0 ? 340 : 170;
    const x = center[0] + (random() - 0.5) * spread;
    const z = center[1] + (random() - 0.5) * spread;
    if (blocked(x, z)) continue;
    positions.push([x, z]);
  }
  return positions;
}

// 배치와 이동 경로가 같은 장애물 여유 폭을 사용하도록 판정을 공유한다.
export function crowdBlocked(tiles: VenueTiles, center: Point) {
  const blocked = buildingIndex(tiles.buildings);
  const roads = tiles.roads.filter(
    (road) => road.kind !== "path" && distanceToRoad(...center, road) < 260,
  );
  const water = tiles.areas.filter((area) => area.kind === "water");
  return (x: number, z: number) =>
    blocked(x, z, 4) ||
    roads.some((road) => distanceToRoad(x, z, road) < road.width / 2 + 4) ||
    water.some((area) => insidePolygon(x, z, area.points));
}
