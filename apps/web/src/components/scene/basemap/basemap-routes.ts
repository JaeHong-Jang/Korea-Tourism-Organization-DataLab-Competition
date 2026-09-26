// 바탕 지도의 실제 고속도로 선을 이어 전국 판 차 경로(도로를 따라 굽는 왕복 경로)로 만든다.
import type { MotionRoute } from "../motion/rail-lines";
import { graphRoutes, routeGraph } from "../venue/routes";
import type { VenueLine } from "../venue/tiles";
import { type Basemap, simplify } from "./national-basemap";

// 1km 허용 오차로 한 번 더 줄여 경로 마디를 넓히고, 0.5km 안 끝점은 같은 나들목으로 묶는다.
export function highwayRoutes(basemap: Basemap): MotionRoute[] {
  const lines: VenueLine[] = [];
  for (const road of basemap.roads) {
    if (road.kind !== "highway") continue;
    const points = simplify(road.points, 1);
    for (let index = 1; index < points.length; index++)
      lines.push({
        from: points[index - 1],
        to: points[index],
        kind: "highway",
        width: 1,
      });
  }
  return graphRoutes(routeGraph(lines, 0.5), 48, 350);
}
