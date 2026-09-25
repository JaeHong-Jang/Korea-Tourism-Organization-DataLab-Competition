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

// 동네를 격자 칸으로 나눠 칸마다 출발점을 번갈아 고르고, 직진을 좋아하는 긴 경로를 만든다(한쪽에 몰리지 않게).
export function graphRoutes(
  graph: RouteGraph,
  limit = 16,
  maxLength = 1200,
): MotionRoute[] {
  const connected = graph.nodes
    .map((point, id) => ({ id, point }))
    .filter(({ id }) => graph.edges[id].length > 0);
  if (!connected.length) return [];
  const xs = connected.map(({ point }) => point[0]);
  const zs = connected.map(({ point }) => point[1]);
  const minX = Math.min(...xs);
  const minZ = Math.min(...zs);
  const side = Math.max(1, Math.ceil(Math.sqrt(limit)));
  const width = (Math.max(...xs) - minX) / side || 1;
  const depth = (Math.max(...zs) - minZ) / side || 1;
  const cells: number[][] = Array.from({ length: side * side }, () => []);
  for (const { id, point } of connected) {
    const cx = Math.min(side - 1, Math.floor((point[0] - minX) / width));
    const cz = Math.min(side - 1, Math.floor((point[1] - minZ) / depth));
    cells[cz * side + cx].push(id);
  }
  // 칸 안에서는 번호를 섞어 고르고, 행사장에 가까운 칸부터 돌아 작은 limit에도 행사장 길이 빠지지 않게 한다.
  const center = (cell: number) =>
    Math.hypot(
      minX + ((cell % side) + 0.5) * width,
      minZ + (Math.floor(cell / side) + 0.5) * depth,
    );
  const order = cells
    .map((ids, cell) => ({
      ids: ids.sort((a, b) => ((a * 7919) % 1009) - ((b * 7919) % 1009)),
      cell,
    }))
    .filter(({ ids }) => ids.length > 0)
    .sort((a, b) => center(a.cell) - center(b.cell));
  const routes: MotionRoute[] = [];
  for (let pass = 0; pass < 8 && routes.length < limit; pass++)
    for (const { ids } of order) {
      const id = ids[pass];
      if (id === undefined) continue;
      const route = straightRoute(graph, id, maxLength);
      if (route) routes.push(route);
      if (routes.length === limit) break;
    }
  return routes;
}

// 한 교차점에서 가장 덜 꺾이는 쪽으로 이어 걸어 최대 40마디·maxLength(m) 경로를 만든다.
function straightRoute(
  graph: RouteGraph,
  id: number,
  maxLength: number,
): MotionRoute | null {
  const path = [id];
  let length = 0;
  while (path.length < 40 && length < maxLength) {
    const current = path[path.length - 1];
    const previous = path[path.length - 2];
    const [cx, cz] = graph.nodes[current];
    const heading =
      previous === undefined
        ? null
        : Math.atan2(
            cx - graph.nodes[previous][0],
            cz - graph.nodes[previous][1],
          );
    const turn = (node: number) => {
      if (heading === null) return (node * 7919) % 1009;
      const angle = Math.atan2(
        graph.nodes[node][0] - cx,
        graph.nodes[node][1] - cz,
      );
      return Math.abs(
        Math.atan2(Math.sin(angle - heading), Math.cos(angle - heading)),
      );
    };
    const next = graph.edges[current]
      .filter((node) => !path.includes(node))
      .sort((a, b) => turn(a) - turn(b))[0];
    if (next === undefined) break;
    length += Math.hypot(graph.nodes[next][0] - cx, graph.nodes[next][1] - cz);
    path.push(next);
  }
  if (path.length < 3 || length < 60) return null;
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
  return { name: `동네 길 ${id}`, points, lengths, length };
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
  const last = route.points[route.points.length - 1];
  const first = route.points[0];
  const forwardInward =
    Math.hypot(last[0], last[1]) < Math.hypot(first[0], first[1]);
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

// 두 점에 가장 가까운 연결점 사이를 길이 가중 최단 경로(다익스트라·이진 힙)로 이어 한 방향 경로를 만든다.
export function pathRoute(
  graph: RouteGraph,
  from: Point,
  to: Point,
  name: string,
): MotionRoute | null {
  const nearest = (point: Point) => {
    let best = -1;
    let gap = Infinity;
    graph.nodes.forEach((node, id) => {
      const distance = Math.hypot(node[0] - point[0], node[1] - point[1]);
      if (graph.edges[id].length && distance < gap) {
        gap = distance;
        best = id;
      }
    });
    return best;
  };
  const start = nearest(from);
  const goal = nearest(to);
  if (start < 0 || goal < 0 || start === goal) return null;
  const cost = new Float64Array(graph.nodes.length).fill(Infinity);
  const previous = new Int32Array(graph.nodes.length).fill(-1);
  const heap: [number, number][] = [[0, start]];
  cost[start] = 0;
  // 힙에서 가장 싼 점을 꺼내 이웃 비용을 줄인다(이미 더 싼 값으로 방문한 점은 건너뜀).
  while (heap.length) {
    const [spent, id] = pop(heap);
    if (id === goal) break;
    if (spent > cost[id]) continue;
    for (const next of graph.edges[id]) {
      const step =
        spent +
        Math.hypot(
          graph.nodes[next][0] - graph.nodes[id][0],
          graph.nodes[next][1] - graph.nodes[id][1],
        );
      if (step < cost[next]) {
        cost[next] = step;
        previous[next] = id;
        push(heap, [step, next]);
      }
    }
  }
  if (!Number.isFinite(cost[goal])) return null;
  const path: number[] = [];
  for (let id = goal; id !== -1; id = previous[id]) path.unshift(id);
  const points = path.map((id) => graph.nodes[id]);
  const lengths = [0];
  for (let step = 1; step < points.length; step++)
    lengths.push(
      lengths[step - 1] +
        Math.hypot(
          points[step][0] - points[step - 1][0],
          points[step][1] - points[step - 1][1],
        ),
    );
  return { name, points, lengths, length: lengths.at(-1) ?? 0 };
}

// 비용이 작은 항목이 맨 앞에 오는 이진 힙의 넣기·꺼내기.
function push(heap: [number, number][], item: [number, number]) {
  heap.push(item);
  for (let at = heap.length - 1; at > 0; ) {
    const parent = (at - 1) >> 1;
    if (heap[parent][0] <= heap[at][0]) break;
    [heap[parent], heap[at]] = [heap[at], heap[parent]];
    at = parent;
  }
}
function pop(heap: [number, number][]): [number, number] {
  const top = heap[0];
  const last = heap.pop() as [number, number];
  if (heap.length) {
    heap[0] = last;
    for (let at = 0; ; ) {
      const left = at * 2 + 1;
      const right = left + 1;
      let small = at;
      if (left < heap.length && heap[left][0] < heap[small][0]) small = left;
      if (right < heap.length && heap[right][0] < heap[small][0]) small = right;
      if (small === at) break;
      [heap[small], heap[at]] = [heap[at], heap[small]];
      at = small;
    }
  }
  return top;
}
