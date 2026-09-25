// 구름과 강수 위치가 판 밖으로 나가지 않는지 확인한다.
import { expect, it } from "vitest";
import { cloudPuffPosition } from "../weather/cloud-deck";
import { precipitationPoint } from "../weather/precipitation";

// 국토 판과 행사장 판에서 모든 입자의 중심을 내부에 둔다.
it("구름과 입자를 판 내부에 둔다", () => {
  for (const [width, depth] of [
    [600, 900],
    [2400, 2400],
  ]) {
    for (let index = 0; index < 160; index++) {
      const [x, z] = precipitationPoint(index, width, depth);
      expect(Math.abs(x)).toBeLessThan(width / 2);
      expect(Math.abs(z)).toBeLessThan(depth / 2);
    }
    for (let cluster = 0; cluster < 3; cluster++) {
      for (const puff of [-0.24, 0, 0.23]) {
        const [x, z] = cloudPuffPosition(cluster, puff, width, depth);
        expect(Math.abs(x) + width * 0.13).toBeLessThan(width / 2);
        expect(Math.abs(z) + depth * 0.07).toBeLessThan(depth / 2);
      }
    }
  }
});
