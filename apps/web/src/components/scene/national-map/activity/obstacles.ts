// 건물과 물의 구멍까지 보존한 공간 색인으로 보행·축제 시설의 충돌을 검사한다.
import { insidePolygon } from "../../city/free-space";
import type { MapPoint, MapTile, MapRoad } from "../types";
const CELL = 0.05;
export function distanceToSegment(point: MapPoint, a: MapPoint, b: MapPoint) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) /
        (dx * dx + dz * dz || 1),
    ),
  );
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dz);
}

// 큰 수면은 별도 목록에 두어 전국 해안 폴리곤이 색인 메모리를 늘리지 않게 한다.
export function obstacleIndex(data: MapTile) {
  const cells = new Map<string, MapPoint[][][]>(),
    large: MapPoint[][][] = [];
  const polygons = [
    ...data.buildings.flatMap((b) => b.polygons),
    ...data.areas.filter((a) => a.kind === "water").flatMap((a) => a.polygons),
  ];
  for (const rings of polygons) {
    if (!rings[0]?.length) continue;
    const xs = rings[0].map((p) => p[0]),
      zs = rings[0].map((p) => p[1]);
    const x0 = Math.floor(Math.min(...xs) / CELL),
      x1 = Math.floor(Math.max(...xs) / CELL),
      z0 = Math.floor(Math.min(...zs) / CELL),
      z1 = Math.floor(Math.max(...zs) / CELL);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 1500) {
      large.push(rings);
      continue;
    }
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const k = `${x}/${z}`,
          a = cells.get(k) ?? [];
        a.push(rings);
        cells.set(k, a);
      }
  }
  return (point: MapPoint) =>
    [
      ...(cells.get(
        `${Math.floor(point[0] / CELL)}/${Math.floor(point[1] / CELL)}`,
      ) ?? []),
      ...large,
    ].some(
      (r) =>
        insidePolygon(...point, r[0]) &&
        !r.slice(1).some((h) => insidePolygon(...point, h)),
    );
}

// 긴 구간도 3m마다 확인해 건물 모서리나 수면을 가로질러 이동하지 않는다.
export function clearSegment(
  a: MapPoint,
  b: MapPoint,
  blocked: (point: MapPoint) => boolean,
) {
  const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.003);
  for (let i = 0; i <= steps; i++) {
    const t = i / (steps || 1);
    if (blocked([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]))
      return false;
  }
  return true;
}

// 보도 후보가 다른 차도를 가로지를 경우 해당 구간을 연결하지 않는다.
export function roadBarrier(roads: MapRoad[]) {
  const cells = new Map<
    string,
    { a: MapPoint; b: MapPoint; width: number }[]
  >();
  for (const road of roads.filter((r) =>
    ["highway", "major_road", "minor_road", "rail"].includes(r.kind),
  ))
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1],
        b = road.points[i],
        pad = road.width / 2;
      for (
        let x = Math.floor((Math.min(a[0], b[0]) - pad) / CELL);
        x <= Math.floor((Math.max(a[0], b[0]) + pad) / CELL);
        x++
      )
        for (
          let z = Math.floor((Math.min(a[1], b[1]) - pad) / CELL);
          z <= Math.floor((Math.max(a[1], b[1]) + pad) / CELL);
          z++
        ) {
          const key = `${x}/${z}`,
            items = cells.get(key) ?? [];
          items.push({ a, b, width: road.width });
          cells.set(key, items);
        }
    }
  return (p: MapPoint) =>
    (
      cells.get(`${Math.floor(p[0] / CELL)}/${Math.floor(p[1] / CELL)}`) ?? []
    ).some((s) => distanceToSegment(p, s.a, s.b) < s.width / 2 + 0.0004);
}
