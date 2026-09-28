// 국경을 넘는 피복을 자르면서 섬과 내부 구멍을 보존하는지 확인한다.
import { describe, expect, it } from "vitest";
import { clipLandCover } from "../basemap/clip-land-cover";
import type { Point2 } from "../basemap/national-basemap";

// 교차 면적을 손으로 검증할 수 있는 직사각형 경계를 만든다.
const square = (x: number, z: number, size: number): Point2[] => [
  [x, z],
  [x + size, z],
  [x + size, z + size],
  [x, z + size],
  [x, z],
];
const area = (ring: Point2[]) =>
  Math.abs(
    ring.reduce((sum, [x, z], i) => {
      const next = ring[(i + 1) % ring.length];
      return sum + x * next[1] - z * next[0];
    }, 0),
  ) / 2;

describe("남한 경계 피복 자르기", () => {
  it("경계 밖을 제거하고 떨어진 작은 섬과 내부 구멍을 유지한다", () => {
    const boundary = [[square(0, 0, 10), square(2, 2, 2)], [square(20, 0, 2)]];
    const covering = { kind: "farm", rings: [square(-5, -5, 40)] };
    const result = clipLandCover(
      { areas: [covering], water: [covering] },
      boundary,
    );
    expect(result.areas).toHaveLength(2);
    expect(result.areas.some(({ rings }) => rings.length === 2)).toBe(true);
    expect(
      result.areas.reduce(
        (sum, { rings }) =>
          sum +
          area(rings[0]) -
          rings.slice(1).reduce((holes, ring) => holes + area(ring), 0),
        0,
      ),
    ).toBe(100);
    expect(result.water).toEqual(result.areas);
  });

  it("남한 밖의 조각은 버리고 국경을 가로지르는 조각은 잘라낸다", () => {
    const result = clipLandCover(
      {
        areas: [
          { kind: "forest", rings: [square(8, 0, 4)] },
          { kind: "farm", rings: [square(30, 30, 2)] },
        ],
        water: [],
      },
      [[square(0, 0, 10)]],
    );
    expect(result.areas).toHaveLength(1);
    expect(area(result.areas[0].rings[0])).toBe(8);
    expect(clipLandCover({ areas: result.areas, water: [] }, []).areas).toEqual(
      [],
    );
  });
});
