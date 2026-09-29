// 시설 배치와 관람객의 시설 회피가 같은 외곽선을 사용하는지 검증한다.
import { expect, it } from "vitest";
import type { VenueTiles } from "../../components/scene/venue/tiles";
import { crowdBlocked } from "./festival-crowd-placement";
import { festivalLayout } from "./festival-layout";

const tiles: VenueTiles = {
  buildings: [],
  roads: [{ from: [0, -200], to: [0, 200], width: 18, kind: "major_road" }],
  areas: [],
  rails: [],
  stations: [],
};

it("차도를 비우고 시설 자리를 보행 장애물로 등록한다", () => {
  const layout = festivalLayout(tiles, [0, 0]);
  expect(layout.props.length).toBeGreaterThan(1);
  const blocked = crowdBlocked(layout.crowdTiles, [0, 0]);
  for (const prop of layout.props) {
    expect(Math.abs(prop.x) - prop.width / 2).toBeGreaterThan(9);
    expect(blocked(prop.x, prop.z)).toBe(true);
  }
});

it("수면만 있는 지역에는 연출 시설을 만들지 않는다", () => {
  expect(
    festivalLayout(
      {
        ...tiles,
        areas: [
          {
            kind: "water",
            points: [
              [-300, -300],
              [300, -300],
              [300, 300],
              [-300, 300],
            ],
          },
        ],
      },
      [0, 0],
    ).props,
  ).toEqual([]);
});

// 좁은 통로와 급경사를 비우고 보행자가 시설 사이를 지나갈 자리를 유지한다.
it("보행 통로·육지 외부·급경사에는 시설을 배치하지 않는다", () => {
  const layout = festivalLayout(
    {
      ...tiles,
      roads: [{ from: [0, -200], to: [0, 200], width: 4, kind: "path" }],
    },
    [0, 0],
    { allowed: (x) => x < 0 },
  );
  expect(layout.props.length).toBeGreaterThan(0);
  for (const p of layout.props) expect(p.x + p.width / 2).toBeLessThan(-2);
  expect(
    festivalLayout({ ...tiles, roads: [] }, [0, 0], { heightAt: (x) => x })
      .props,
  ).toHaveLength(0);
});
