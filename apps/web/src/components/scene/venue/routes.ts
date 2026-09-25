// 실제 도로 선분의 가까운 끝점을 잇고 재현 가능한 차량 경로를 만든다.
import type { MotionPoint, MotionRoute } from "../motion/rail-lines";
import type { Point } from "./coordinates";
import type { VenueLine } from "./tiles";

export type RouteGraph = { nodes: Point[]; edges: number[][] };

// 3m 안의 끝점은 같은 교차점으로 묶고 중복 선분을 제거한다.
export function routeGraph(lines: VenueLine[], tolerance = 3): RouteGraph {
  const nodes: Point[] = [];
  const edges: number[][] = [];
  const cells = new Map<string, number[]>();
  const key = (x: number, z: number) => `${x},${z}`;
  const nodeFor = (point: Point) => {
    const cx = Math.round(point[0] / tolerance),
      cz = Math.round(point[1] / tolerance);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        for (const id of cells.get(key(cx + dx, cz + dz)) ?? [])
          if (
            Math.hypot(nodes[id][0] - point[0], nodes[id][1] - point[1]) <=
            tolerance
          )
            return id;
    const id = nodes.length;
    nodes.push(point);
    edges.push([]);
    const bucket = cells.get(key(cx, cz)) ?? [];
    bucket.push(id);
    cells.set(key(cx, cz), bucket);
    return id;
  };
  for (const line of lines) {
    const a = nodeFor(line.from),
      b = nodeFor(line.to);
    if (a === b || edges[a].includes(b)) continue;
    edges[a].push(b);
    edges[b].push(a);
  }
  return { nodes, edges };
}

// 가까운 연결점에서 먼 쪽으로 걸어 여러 장난감 차량의 순환 경로를 만든다.
export function graphRoutes(graph: RouteGraph, limit = 16): MotionRoute[] {
  const candidates = graph.nodes
    .map((point, id) => ({ id, distance: Math.hypot(...point) }))
    .filter(({ id }) => graph.edges[id].length > 0)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit * 3);
  const routes: MotionRoute[] = [];
  for (const { id } of candidates) {
    const path = [id];
    let previous = -1;
    while (path.length < 12) {
      const current = path[path.length - 1];
      const next = graph.edges[current]
        .filter((node) => node !== previous && !path.includes(node))
        .sort(
          (a, b) =>
            Math.hypot(...graph.nodes[b]) - Math.hypot(...graph.nodes[a]),
        )[0];
      if (next === undefined) break;
      previous = current;
      path.push(next);
    }
    if (path.length < 3) continue;
    const points = path.map((node) => graph.nodes[node]);
    const lengths = [0];
    for (let step = 1; step < points.length; step++)
      lengths.push(
        lengths[step - 1] +
          Math.hypot(
            points[step][0] - points[step - 1][0],
            points[step][1] - points[step - 1][1],
          ),
      );
    const length = lengths.at(-1) ?? 0;
    if (length < 40) continue;
    routes.push({ name: `행사장 길 ${id}`, points, lengths, length });
    if (routes.length === limit) break;
  }
  return routes;
}

// 시각과 경로 번호만으로 같은 장난감 위치를 내며 행사 전후에는 중심 방향을 택한다.
export function vehicleAt(
  route: MotionRoute,
  seconds: number,
  index: number,
  towardVenue: boolean,
  out: MotionPoint,
): MotionPoint {
  const phase = (seconds * 2.2 + index * 137.17) % (route.length * 2);
  const forwardInward =
    Math.hypot(...route.points[route.points.length - 1]) <
    Math.hypot(...route.points[0]);
  const backwards = towardVenue ? !forwardInward : forwardInward;
  const distance = backwards
    ? route.length - (phase % route.length)
    : phase % route.length;
  let step = 1;
  while (step < route.lengths.length - 1 && route.lengths[step] < distance)
    step++;
  const from = route.points[step - 1],
    to = route.points[step];
  const ratio =
    (distance - route.lengths[step - 1]) /
    (route.lengths[step] - route.lengths[step - 1]);
  out.x = from[0] + (to[0] - from[0]) * ratio;
  out.z = from[1] + (to[1] - from[1]) * ratio;
  out.heading = Math.atan2(
    (to[0] - from[0]) * (backwards ? -1 : 1),
    (to[1] - from[1]) * (backwards ? -1 : 1),
  );
  return out;
}

// 행사 시작에 가까운 3시간만 중심 방향 차량 비중을 점차 키운다.
export function towardShare(hour: number, eventHour: number): number {
  return Math.max(0.15, Math.min(0.8, 0.8 - Math.abs(hour - eventHour) * 0.2));
}
