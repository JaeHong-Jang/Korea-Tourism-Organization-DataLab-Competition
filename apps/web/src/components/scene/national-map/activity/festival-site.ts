// 전국 지도 자료를 이전 축제 시설·관람객 코드의 지역 미터 좌표로 연결한다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import type { MapPoint, MapTile } from "../types";
import type { VenueTiles } from "../../venue/tiles";
import { festivalLayout } from "../../../../features/regional-diorama/festival-layout";
import { terrainHeight, type ElevationGrid } from "../../terrain/elevation";
import type { CrowdGoal } from "../../../../features/regional-diorama/crowd-walking";

// 행사 좌표는 옮기지 않고 그 주변의 빈 공간만 사용하며 산비탈 시설은 제외한다.
export function createFestivalSite(
  data: MapTile,
  center: MapPoint,
  type: FestivalSummary["type"],
  elevation?: ElevationGrid,
  land?: (point: MapPoint) => boolean,
) {
  const local = (p: MapPoint): MapPoint => [
    (p[0] - center[0]) * 1000,
    (p[1] - center[1]) * 1000,
  ];
  const nearby = (p: MapPoint) =>
    Math.abs(p[0] - center[0]) < 0.6 && Math.abs(p[1] - center[1]) < 0.6;
  const tiles: VenueTiles = {
    buildings: data.buildings
      .flatMap((b) => b.polygons)
      .filter((r) => r[0].some(nearby))
      .map((r) => {
        const footprint = r[0].map(local),
          xs = footprint.map((p) => p[0]),
          zs = footprint.map((p) => p[1]);
        return {
          x: (Math.min(...xs) + Math.max(...xs)) / 2,
          z: (Math.min(...zs) + Math.max(...zs)) / 2,
          width: Math.max(...xs) - Math.min(...xs),
          depth: Math.max(...zs) - Math.min(...zs),
          height: 10,
          minHeight: 0,
          footprint,
        };
      }),
    roads: data.roads
      .filter((r) => r.kind !== "rail")
      .flatMap((r) =>
        r.points.slice(1).flatMap((p, i) =>
          nearby(p) || nearby(r.points[i])
            ? [
                {
                  from: local(r.points[i]),
                  to: local(p),
                  width: r.width * 1000,
                  kind: r.kind,
                },
              ]
            : [],
        ),
      ),
    rails: [],
    areas: data.areas
      .filter((a) => a.kind === "water")
      .flatMap((a) =>
        a.polygons.map((r) => ({
          kind: "water" as const,
          points: r[0].map(local),
        })),
      ),
    stations: [],
  };
  const heightAt = (x: number, z: number) =>
    terrainHeight(elevation, center[0] + x / 1000, center[1] + z / 1000) * 1000;
  const allowed = (x: number, z: number) =>
    !land || land([center[0] + x / 1000, center[1] + z / 1000]);
  const layout = festivalLayout(tiles, [0, 0], {
    limit:
      type === "먹거리" ? 34 : type === "공연" || type === "불꽃" ? 28 : 24,
    stage: type !== "꽃",
    garden: type === "꽃",
    heightAt,
    allowed,
  });
  const goals: CrowdGoal[] = layout.props.map((p) => ({
    point: [p.x, p.z + p.depth / 2 + (p.stage ? 18 : 4)],
    kind: p.stage ? "watch" : p.kind === "lounge" ? "rest" : "queue",
  }));
  return { ...layout, heightAt, goals, allowed };
}
