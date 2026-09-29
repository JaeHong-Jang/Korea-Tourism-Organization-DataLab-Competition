// 실제 보행 거리와 이동 중 장애물 회피를 검증한다.
import { expect, it } from "vitest";
import type { VenueTiles } from "../../components/scene/venue/tiles";
import { clearWalk, createCrowdWalk } from "./crowd-walking";
import { crowdBlocked } from "./festival-crowd-placement";

const tiles: VenueTiles = {
  buildings: [],
  roads: [{ from: [0, -200], to: [0, 200], width: 12, kind: "major_road" }],
  areas: [],
  rails: [],
  stations: [],
};

it("제자리 진동을 넘어 이동하며 차도를 가로지르지 않는다", () => {
  const walk = createCrowdWalk(tiles, [0, 0]);
  const initial = walk.people.map((p) => [p.x, p.z]);
  const blocked = crowdBlocked(tiles, [0, 0]);
  for (let frame = 0; frame < 1200; frame++) {
    walk.step(0.05);
    for (const p of walk.people) expect(blocked(p.x, p.z)).toBe(false);
  }
  const moved = walk.people.filter(
    (p, i) => Math.hypot(p.x - initial[i][0], p.z - initial[i][1]) > 10,
  );
  expect(moved.length).toBeGreaterThan(walk.people.length / 2);
  walk.people.forEach((p, i) => {
    expect(Math.sign(p.x)).toBe(Math.sign(initial[i][0]));
  });
});

it("양 끝이 비어 있어도 중간에 장애물이 있으면 경로를 거부한다", () => {
  expect(clearWalk([-10, 0], [10, 0], (x) => Math.abs(x) < 2)).toBe(false);
});
