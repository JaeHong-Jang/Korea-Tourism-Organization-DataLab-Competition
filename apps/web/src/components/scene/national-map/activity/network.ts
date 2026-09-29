// 실제 도로·철도·보행 가능 공간을 전역 좌표의 연결 그래프로 만든다.
import type { MapPoint, MapTile } from "../types";
import { clearSegment, obstacleIndex, roadBarrier } from "./obstacles";
export type Edge = {
  id: string;
  from: string;
  to: string;
  a: MapPoint;
  b: MapPoint;
  length: number;
  width: number;
  kind: string;
};
export type Network = { edges: Map<string, Edge>; out: Map<string, Edge[]> };
export const nodeKey = (p: MapPoint) =>
  `${Math.round(p[0] * 500)},${Math.round(p[1] * 500)}`;

// 식별자는 배열 순서 대신 실제 좌표로 고정해 타일 갱신 후에도 이동 상태를 이어간다.
export function buildNetwork(
  data: MapTile,
  mode: "car" | "walk" | "rail",
): Network {
  const result: Network = { edges: new Map(), out: new Map() };
  const blocked = mode === "walk" ? obstacleIndex(data) : () => false;
  const crossing = mode === "walk" ? roadBarrier(data.roads) : () => false;
  const add = (a: MapPoint, b: MapPoint, width: number, kind: string) => {
    const from = nodeKey(a),
      to = nodeKey(b),
      id = `${mode}:${from}>${to}`;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (from === to || length < 0.002 || result.edges.has(id)) return;
    const edge = { id, from, to, a, b, length, width, kind };
    result.edges.set(id, edge);
    const out = result.out.get(from) ?? [];
    out.push(edge);
    result.out.set(from, out);
  };
  for (const road of data.roads) {
    if (
      mode === "car" &&
      !["highway", "major_road", "minor_road"].includes(road.kind)
    )
      continue;
    if (mode === "rail" && road.kind !== "rail") continue;
    if (
      mode === "walk" &&
      !["path", "minor_road", "major_road"].includes(road.kind)
    )
      continue;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1],
        b = road.points[i],
        length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (mode === "walk") {
        const sides = road.kind === "path" ? [0] : [-1, 1];
        for (const side of sides) {
          const lane = side * (road.width / 2 + 0.002),
            dx = (-(b[1] - a[1]) / (length || 1)) * lane,
            dz = ((b[0] - a[0]) / (length || 1)) * lane;
          const p: MapPoint = [a[0] + dx, a[1] + dz],
            q: MapPoint = [b[0] + dx, b[1] + dz];
          if (!clearSegment(p, q, (point) => blocked(point) || crossing(point)))
            continue;
          add(p, q, 0.0025, "walk");
          add(q, p, 0.0025, "walk");
        }
      } else {
        if (road.oneway !== -1 || mode === "rail")
          add(a, b, road.width, road.kind);
        if (road.oneway !== 1 || mode === "rail")
          add(b, a, road.width, road.kind);
      }
    }
  }
  return result;
}
