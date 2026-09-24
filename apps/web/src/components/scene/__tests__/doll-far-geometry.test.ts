// 원거리 인형 형상이 카메라가 갈 수 있는 어느 시선에서도 면적을 갖는지 확인한다.
import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { dollFarGeometry } from "../crowd/doll-geometry";

// 시선 방향에 수직인 평면으로 삼각형마다 투영한 면적을 더한다(양면 재료라 부호는 버린다).
function projectedArea(direction: Vector3): number {
  const geometry = dollFarGeometry();
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const count = index ? index.count : position.count;
  const vertex = (at: number) =>
    new Vector3().fromBufferAttribute(position, index ? index.getX(at) : at);
  let area = 0;
  for (let at = 0; at < count; at += 3) {
    const a = vertex(at);
    const normal = vertex(at + 1)
      .sub(a)
      .cross(vertex(at + 2).sub(a));
    area += Math.abs(normal.dot(direction)) / 2;
  }
  geometry.dispose();
  return area;
}

describe("원거리 인형 형상", () => {
  // 2,000개를 그려도 가볍도록 인형 하나의 삼각형을 12개 이하로 둔다.
  it("삼각형이 12개 이하다", () => {
    const geometry = dollFarGeometry();
    const index = geometry.getIndex();
    const triangles =
      (index ? index.count : geometry.getAttribute("position").count) / 3;
    geometry.dispose();
    expect(triangles).toBeLessThanOrEqual(12);
  });

  // 정면·측면·대각·바로 위·비스듬한 위 어느 쪽에서 봐도 면적이 사라지지 않아야 한다.
  it.each([
    [0, 0, 1],
    [1, 0, 0],
    [1, 0, 1],
    [0, -1, 0],
    [1, -3, 0],
    [0, -3, 1],
    [1, -1, 1],
  ])("시선 (%d, %d, %d)에서 면적이 남는다", (x, y, z) => {
    expect(projectedArea(new Vector3(x, y, z).normalize())).toBeGreaterThan(
      0.08,
    );
  });
});
