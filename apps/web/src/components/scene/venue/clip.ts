// 벡터 타일 버퍼를 타일 본래 경계로 잘라 이웃 타일의 중복을 없앤다.
import type { Point } from "./coordinates";
import { TILE_EXTENT } from "./coordinates";

// 한 경계에서 안쪽 점만 남기고 경계 교차점을 정확히 삽입한다.
function clipEdge(
  points: Point[],
  axis: 0 | 1,
  bound: number,
  keepGreater: boolean,
): Point[] {
  const result: Point[] = [];
  for (let index = 0; index < points.length; index++) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const insideA = keepGreater ? a[axis] >= bound : a[axis] <= bound;
    const insideB = keepGreater ? b[axis] >= bound : b[axis] <= bound;
    if (insideA) result.push(a);
    if (insideA !== insideB) {
      const ratio = (bound - a[axis]) / (b[axis] - a[axis]);
      result.push([a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio]);
    }
  }
  return result;
}

// 다각형 조각은 경계 위 점을 공유하므로 타일 사이에 틈이 생기지 않는다.
export function clipPolygon(points: Point[], extent = TILE_EXTENT): Point[] {
  let result = points;
  for (const [axis, bound, greater] of [
    [0, 0, true],
    [0, extent, false],
    [1, 0, true],
    [1, extent, false],
  ] as const)
    result = clipEdge(result, axis, bound, greater);
  return result;
}

// 선분을 Liang–Barsky 범위로 잘라 버퍼에만 있는 도로를 버린다.
export function clipSegment(
  a: Point,
  b: Point,
  extent = TILE_EXTENT,
): [Point, Point] | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let enter = 0;
  let leave = 1;
  for (const [p, q] of [
    [-dx, a[0]],
    [dx, extent - a[0]],
    [-dy, a[1]],
    [dy, extent - a[1]],
  ]) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const ratio = q / p;
    if (p < 0) enter = Math.max(enter, ratio);
    else leave = Math.min(leave, ratio);
    if (enter > leave) return null;
  }
  return [
    [a[0] + dx * enter, a[1] + dy * enter],
    [a[0] + dx * leave, a[1] + dy * leave],
  ];
}
