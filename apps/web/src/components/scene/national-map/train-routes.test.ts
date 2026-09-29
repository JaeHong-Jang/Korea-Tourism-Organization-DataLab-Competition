// 열차가 실제 철도만 사용하며 굽은 선로와 끝점에서 편성이 끊기지 않는지 검증한다.
import { expect, it } from "vitest";
import { trainCarAt, trainRoutes } from "./train-routes";
import type { MapRoad } from "./types";

const rail: MapRoad = {
  kind: "rail",
  width: 0.004,
  name: "철도",
  points: [
    [0, 0],
    [0.3, 0],
    [0.3, 0.4],
  ],
};

it("도로에는 열차를 만들지 않고 짧은 철도에는 편성을 억지로 넣지 않는다", () => {
  expect(trainRoutes([{ ...rail, kind: "major_road" }], [0, 0])).toEqual([]);
  expect(
    trainRoutes(
      [
        {
          ...rail,
          points: [
            [0, 0],
            [0.05, 0],
          ],
        },
      ],
      [0, 0],
    ),
  ).toEqual([]);
});

it("왕복 중 모든 차량이 실제 꺾인 선로 위에 남는다", () => {
  const [route] = trainRoutes([rail], [0, 0]);
  expect(route).toBeDefined();
  for (let t = 0; t < 180; t += 0.5)
    for (let car = 0; car < 3; car++) {
      const p = trainCarAt(route, t, 0, car, { x: 0, z: 0, heading: 0 });
      expect(Number.isFinite(p.heading)).toBe(true);
      expect(
        (Math.abs(p.z) < 0.001 && p.x >= 0 && p.x <= 300.001) ||
          (Math.abs(p.x - 300) < 0.001 && p.z >= 0 && p.z <= 400.001),
      ).toBe(true);
    }
});
