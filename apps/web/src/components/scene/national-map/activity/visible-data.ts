// 이동 그래프에 필요한 화면 주변 자료만 남겨 먼 타일의 경로 계산과 메모리 사용을 줄인다.
import type { MapPoint, MapTile } from "../types";
import type { ActivityWindow } from "./window";

// 폴리곤 꼭짓점이 모두 화면 밖이어도 화면을 덮는 건물과 수면은 보존한다.
function intersects(points: MapPoint[], view: ActivityWindow) {
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const [x, z] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return (
    minX <= view.maxX &&
    maxX >= view.minX &&
    minZ <= view.maxZ &&
    maxZ >= view.minZ
  );
}

// 도로의 연속된 구간을 유지하며 넓은 화면에서는 잘 보이는 간선 교통부터 사용한다.
export function visibleActivityData(
  data: MapTile,
  view: ActivityWindow,
): MapTile {
  const pad = view.width * 0.2,
    area = {
      ...view,
      minX: view.minX - pad,
      maxX: view.maxX + pad,
      minZ: view.minZ - pad,
      maxZ: view.maxZ + pad,
    };
  const roads: MapTile["roads"] = [];
  for (const road of data.roads) {
    if (view.width > 8 && road.kind === "minor_road") continue;
    if (view.width > 7 && road.kind === "path") continue;
    let points: MapPoint[] = [];
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1],
        b = road.points[i];
      if (intersects([a, b], area)) {
        if (!points.length) points.push(a);
        points.push(b);
      } else if (points.length) {
        roads.push({ ...road, points });
        points = [];
      }
    }
    if (points.length) roads.push({ ...road, points });
  }
  return {
    roads,
    buildings: data.buildings.filter((b) =>
      b.polygons.some((p) => intersects(p[0], area)),
    ),
    areas: data.areas.filter(
      (a) =>
        a.kind === "water" && a.polygons.some((p) => intersects(p[0], area)),
    ),
    places: [],
  };
}
