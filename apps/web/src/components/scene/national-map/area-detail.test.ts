// 화면에서 보이지 않는 작은 면·도로만 빠지고 큰 면과 도로 양 끝은 그대로 남는지 확인한다.
import { describe, expect, it } from "vitest";
import { visibleAreas, visibleRoads } from "./area-detail";
import type { MapPoint } from "./types";

// 한 변이 size인 닫힌 정사각형 링(꼭짓점 사이를 step 간격으로 촘촘히 채운다).
function square(size: number, step = size): MapPoint[] {
  const ring: MapPoint[] = [];
  for (let x = 0; x < size; x += step) ring.push([x, 0]);
  for (let z = 0; z < size; z += step) ring.push([size, z]);
  for (let x = size; x > 0; x -= step) ring.push([x, size]);
  for (let z = size; z > 0; z -= step) ring.push([0, z]);
  ring.push([0, 0]);
  return ring;
}

describe("visibleAreas", () => {
  // 화면 폭 700이면 2픽셀 = 2(지도 단위)다.
  it("2픽셀보다 작은 면과 구멍은 빼고 큰 면은 남긴다", () => {
    const areas = visibleAreas(
      [
        { kind: "forest", polygons: [[square(1)]] },
        { kind: "water", polygons: [[square(100), square(1)]] },
      ],
      1400,
    );
    expect(areas).toHaveLength(1);
    expect(areas[0].kind).toBe("water");
    expect(areas[0].polygons[0]).toHaveLength(1);
  });

  // 꼭짓점 간격이 1픽셀보다 촘촘하면 줄이되 첫·끝 점은 그대로 둔다.
  it("촘촘한 꼭짓점을 줄이고 링을 닫힌 채로 둔다", () => {
    const ring = square(100, 0.1);
    const [area] = visibleAreas([{ kind: "park", polygons: [[ring]] }], 700);
    const thinned = area.polygons[0][0];
    expect(thinned.length).toBeLessThan(ring.length / 5);
    expect(thinned[0]).toEqual(ring[0]);
    expect(thinned.at(-1)).toEqual(ring.at(-1));
  });
});

describe("visibleRoads", () => {
  it("아주 짧은 도로는 빼고 긴 도로는 양 끝을 유지한다", () => {
    const points: MapPoint[] = Array.from({ length: 101 }, (_, i) => [
      i * 0.1,
      0,
    ]);
    const roads = visibleRoads(
      [
        {
          kind: "path",
          name: "",
          width: 1,
          points: [
            [0, 0],
            [0.5, 0],
          ],
        },
        { kind: "major_road", name: "", width: 1, points },
      ],
      700,
    );
    expect(roads).toHaveLength(1);
    expect(roads[0].points[0]).toEqual([0, 0]);
    expect(roads[0].points.at(-1)).toEqual([10, 0]);
    expect(roads[0].points.length).toBeLessThan(points.length);
  });
});
