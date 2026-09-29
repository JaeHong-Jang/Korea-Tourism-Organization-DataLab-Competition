// 지역 스타일을 적용해도 건물 높이·좌표가 유지되고 벽과 지붕이 구분되는지 확인한다.

import { Color } from "three";
import { expect, it } from "vitest";
import { regionalBuildingGeometry } from "./regional-buildings";

it("실제 외곽선·높이를 유지하며 지붕과 벽의 색상을 구분한다", () => {
  const geometry = regionalBuildingGeometry([
    {
      x: 10,
      z: 5,
      width: 20,
      depth: 10,
      height: 120,
      minHeight: 0,
      footprint: [
        [0, 0],
        [20, 0],
        [20, 10],
        [0, 10],
      ],
    },
  ]);
  expect(geometry).not.toBeNull();
  if (!geometry) return;
  geometry.computeBoundingBox();
  expect(geometry.boundingBox?.max.y).toBeCloseTo(120);
  expect(geometry.boundingBox?.max.x).toBeCloseTo(20);
  const normal = geometry.getAttribute("normal");
  const color = geometry.getAttribute("color");
  const roof = new Color("#dfd8c8");
  const wall = new Color("#c4bba7");
  let roofs = 0;
  let walls = 0;
  for (let i = 0; i < normal.count; i++) {
    const expected = normal.getY(i) > 0.5 ? roof : wall;
    if (expected === roof) roofs++;
    else walls++;
    expect(color.getX(i)).toBeCloseTo(expected.r);
    expect(color.getY(i)).toBeCloseTo(expected.g);
    expect(color.getZ(i)).toBeCloseTo(expected.b);
  }
  expect(roofs).toBeGreaterThan(0);
  expect(walls).toBeGreaterThan(0);
  geometry.dispose();
});

it("자료가 없는 지역에 가짜 건물을 만들지 않는다", () => {
  expect(regionalBuildingGeometry([])).toBeNull();
});
