// 실제 시설이 아닌 축제 연출용 부스·무대를 빈 공간에 배치한다.
import { seededRandom } from "../../components/scene/city/free-space";
import type { Point } from "../../components/scene/venue/coordinates";
import type { VenueTiles } from "../../components/scene/venue/tiles";
import { crowdBlocked, distanceToRoad } from "./festival-crowd-placement";
export type FestivalProp = {
  x: number;
  z: number;
  width: number;
  depth: number;
  stage: boolean;
  y?: number;
  kind?: "booth" | "lounge" | "gate" | "info" | "garden";
};

// 시설 전체 바닥과 주변 여유 공간을 검사해 차도·건물·물과 겹치지 않게 한다.
export function festivalLayout(
  tiles: VenueTiles,
  center: Point,
  options: {
    limit?: number;
    stage?: boolean;
    garden?: boolean;
    heightAt?: (x: number, z: number) => number;
    allowed?: (x: number, z: number) => boolean;
  } = {},
) {
  const blocked = crowdBlocked(tiles, center);
  const paths = tiles.roads.filter((road) => road.kind === "path");
  const random = seededRandom(571);
  const props: FestivalProp[] = [];
  const gateIndex = Math.min(7, (options.limit ?? 34) - 5);
  for (
    let trial = 0;
    trial < 1500 && props.length < (options.limit ?? 34);
    trial++
  ) {
    const stage = options.stage !== false && props.length === 0 && trial < 200;
    const kind =
      !stage && props.length === gateIndex
        ? "gate"
        : !stage && props.length % 5 === 3
          ? "lounge"
          : !stage && props.length === 1
            ? "info"
            : !stage && options.garden && props.length % 3 === 0
              ? "garden"
              : "booth";
    const width = stage ? 28 : kind === "gate" ? 20 : 12;
    const depth = stage ? 18 : kind === "gate" ? 4 : 10;
    const range = trial < 200 ? 130 : 230;
    const structured = !stage && trial < 500;
    const row = Math.floor((trial % 24) / 8);
    const column = trial % 8;
    const x =
      center[0] + (structured ? (column - 3.5) * 17 : (random() - 0.5) * range);
    const z =
      center[1] + (structured ? (row - 1) * 38 + 20 : (random() - 0.5) * range);
    const stageProp = props.find((p) => p.stage);
    if (
      !stage &&
      stageProp &&
      Math.abs(x - stageProp.x) < 24 &&
      z > stageProp.z &&
      z < stageProp.z + 40
    )
      continue;
    if (
      props.some(
        (p) =>
          Math.abs(p.x - x) < (p.width + width) / 2 + 4 &&
          Math.abs(p.z - z) < (p.depth + depth) / 2 + 4,
      )
    )
      continue;
    let clear = true;
    for (let dx = -width / 2 - 2; dx <= width / 2 + 2; dx += 2)
      for (let dz = -depth / 2 - 2; dz <= depth / 2 + 2; dz += 2)
        if (
          blocked(x + dx, z + dz) ||
          options.allowed?.(x + dx, z + dz) === false ||
          paths.some(
            (road) => distanceToRoad(x + dx, z + dz, road) < road.width / 2 + 1,
          )
        )
          clear = false;
    const heights = [
      [-width / 2, -depth / 2],
      [width / 2, -depth / 2],
      [-width / 2, depth / 2],
      [width / 2, depth / 2],
    ].map(([dx, dz]) => options.heightAt?.(x + dx, z + dz) ?? 0);
    if (Math.max(...heights) - Math.min(...heights) > 1.8) clear = false;
    if (clear)
      props.push({ x, z, width, depth, stage, kind, y: Math.max(...heights) });
  }
  // 보행 계산에 시설 외곽선을 전달해 사람들이 부스 안을 통과하지 않게 한다.
  const crowdTiles: VenueTiles = {
    ...tiles,
    buildings: [
      ...tiles.buildings,
      ...props.map((p) => ({
        ...p,
        height: 8,
        minHeight: 0,
        footprint: [
          [p.x - p.width / 2, p.z - p.depth / 2],
          [p.x + p.width / 2, p.z - p.depth / 2],
          [p.x + p.width / 2, p.z + p.depth / 2],
          [p.x - p.width / 2, p.z + p.depth / 2],
        ] as Point[],
      })),
    ],
  };
  return { props, crowdTiles };
}
