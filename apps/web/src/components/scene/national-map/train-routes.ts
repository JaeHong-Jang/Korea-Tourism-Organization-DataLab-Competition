// 실제 지상 철도 선분만 연결하고 한 편성이 끝까지 선로 안에 머물게 한다.

import {
  type MotionPoint,
  type MotionRoute,
  routePosition,
} from "../motion/rail-lines";
import { graphRoutes, routeGraph } from "../venue/routes";
import type { MapPoint, MapRoad } from "./types";

// km 지도 좌표를 중심 기준 미터로 바꿔 기존 연결 경로 계산을 재사용한다.
export function trainRoutes(roads: MapRoad[], center: MapPoint) {
  const lines = roads
    .filter((road) => road.kind === "rail")
    .flatMap((road) =>
      road.points.slice(1).map((to, i) => ({
        from: [
          (road.points[i][0] - center[0]) * 1000,
          (road.points[i][1] - center[1]) * 1000,
        ] as MapPoint,
        to: [
          (to[0] - center[0]) * 1000,
          (to[1] - center[1]) * 1000,
        ] as MapPoint,
        kind: "rail",
        width: 4,
      })),
    );
  return graphRoutes(routeGraph(lines, 1.5), 16, 6000)
    .filter((route) => route.length > 180)
    .slice(0, 4);
}

// 차량마다 독립적으로 끝점을 돌지 않고 편성 전체가 함께 방향을 바꾼다.
export function trainCarAt(
  route: MotionRoute,
  seconds: number,
  train: number,
  car: number,
  out: MotionPoint,
) {
  const margin = 70;
  const span = route.length - margin * 2;
  const phase =
    (((seconds * 16 + train * 173) % (span * 2)) + span * 2) % (span * 2);
  const reverse = phase > span;
  const head = margin + (reverse ? span * 2 - phase : phase);
  const distance = head + (reverse ? 1 : -1) * car * 23;
  routePosition(route, 0, 0, distance, out);
  if (reverse) out.heading += Math.PI;
  return out;
}
