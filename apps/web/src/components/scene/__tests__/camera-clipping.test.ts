// 전국의 표면 겹침 방지와 건물 확대 시 가까운 형상 보존을 검증한다.
import { expect, test } from "vitest";
import { cameraNearPlane } from "../camera-clipping";

test("전국에서는 깊이 정밀도를 확보하고 확대하면 절단면을 좁힌다", () => {
  expect(cameraNearPlane(1200)).toBe(10);
  expect(cameraNearPlane(1.8)).toBeCloseTo(0.036);
  expect(cameraNearPlane(0.08)).toBeCloseTo(0.0016);
  expect(cameraNearPlane(0)).toBe(0.001);
});
