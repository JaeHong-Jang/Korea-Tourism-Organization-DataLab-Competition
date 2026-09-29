// 연출 관람객의 장애물 회피와 지역 이동 후 축제 좌표 고정을 검증한다.
import { expect, it } from "vitest";
import type { VenueTiles } from "../../components/scene/venue/tiles";
import {
  distanceToRoad,
  festivalCrowdPositions,
} from "./festival-crowd-placement";

const empty: VenueTiles = {
  buildings: [],
  roads: [],
  rails: [],
  areas: [],
  stations: [],
};

it("건물·차도·물 위를 비워 둔다", () => {
  const tiles: VenueTiles = {
    ...empty,
    buildings: [
      {
        x: 0,
        z: 0,
        width: 100,
        depth: 100,
        height: 20,
        minHeight: 0,
        footprint: [
          [-50, -50],
          [50, -50],
          [50, 50],
          [-50, 50],
        ],
      },
    ],
    roads: [{ from: [-200, 70], to: [200, 70], width: 12, kind: "major_road" }],
    areas: [
      {
        kind: "water",
        points: [
          [-200, -200],
          [200, -200],
          [200, -80],
          [-200, -80],
        ],
      },
    ],
  };
  const positions = festivalCrowdPositions(tiles, [0, 0]);
  expect(positions.length).toBeGreaterThan(0);
  for (const [x, z] of positions) {
    expect(Math.abs(x) > 50 || Math.abs(z) > 50).toBe(true);
    expect(distanceToRoad(x, z, tiles.roads[0])).toBeGreaterThanOrEqual(10);
    expect(z).toBeGreaterThanOrEqual(-80);
  }
});

it("타일 원점이 바뀌어도 관람객의 세계 좌표는 축제 주변에 남는다", () => {
  const original = festivalCrowdPositions(empty, [0, 0]);
  const moved = festivalCrowdPositions(empty, [-600, 300]);
  expect(moved.length).toBe(original.length);
  moved.forEach(([x, z], i) => {
    expect(x + 600).toBeCloseTo(original[i][0]);
    expect(z - 300).toBeCloseTo(original[i][1]);
  });
});
