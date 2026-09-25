// 동네 3D 건물 종류 추정·부품 형상·빈 동네 채우기를 확인한다.

import { Color } from "three";
import { describe, expect, it } from "vitest";
import type { Point } from "../venue/coordinates";
import type { VenueBuilding, VenueLine, VenueTiles } from "../venue/tiles";
import { buildingPalette, cityBuildingGeometry } from "./building-geometry";
import {
  buildingKind,
  footprintFrame,
  kindContext,
  kindHeight,
  styleBuildings,
} from "./building-kind";
import { gableRoof } from "./building-parts";
import { fillBuildings } from "./fill-buildings";

// 중심·크기로 축에 맞춘 사각형 외곽선을 만든다.
const box = (x: number, z: number, w: number, d: number): Point[] => [
  [x - w / 2, z - d / 2],
  [x + w / 2, z - d / 2],
  [x + w / 2, z + d / 2],
  [x - w / 2, z + d / 2],
];
const building = (
  x: number,
  z: number,
  w: number,
  d: number,
  extra: Partial<VenueBuilding> = {},
): VenueBuilding => ({
  x,
  z,
  width: w,
  depth: d,
  height: 9,
  minHeight: 0,
  footprint: box(x, z, w, d),
  guessed: true,
  ...extra,
});
const road = (from: Point, to: Point, kind = "minor_road"): VenueLine => ({
  from,
  to,
  kind,
  width: kind === "major_road" ? 8 : 5,
});

describe("건물 종류 추정", () => {
  it("긴 변을 축으로 둘레 사각형과 넓이를 구한다", () => {
    const angle = Math.PI / 6;
    const ring = box(0, 0, 20, 10).map(
      ([x, z]): Point => [
        100 + x * Math.cos(angle) - z * Math.sin(angle),
        50 + x * Math.sin(angle) + z * Math.cos(angle),
      ],
    );
    const frame = footprintFrame(ring);
    expect(frame.length).toBeCloseTo(20, 5);
    expect(frame.width).toBeCloseTo(10, 5);
    expect(frame.area).toBeCloseTo(200, 5);
    expect(frame.cx).toBeCloseTo(100, 5);
    expect(frame.cz).toBeCloseTo(50, 5);
  });

  it("구역·높이·넓이·큰길 거리로 종류를 고른다", () => {
    const context = kindContext(
      [
        { kind: "school", points: box(-500, -500, 200, 200) },
        { kind: "residential", points: box(500, -500, 300, 300) },
        { kind: "commercial", points: box(500, 500, 300, 300) },
      ],
      [road([-800, 300], [-200, 300], "major_road")],
    );
    const kind = (item: VenueBuilding) =>
      buildingKind(item, footprintFrame(item.footprint ?? []), context);
    expect(kind(building(-500, -500, 30, 20))).toBe("school");
    const apartment = building(500, -500, 50, 12);
    expect(kind(apartment)).toBe("apartment");
    const height = kindHeight(apartment, "apartment");
    expect(height).toBeGreaterThanOrEqual(36);
    expect(height).toBeLessThanOrEqual(66);
    expect(
      kind(building(500, 500, 30, 30, { height: 45, guessed: false })),
    ).toBe("office");
    expect(kind(building(-500, 310, 12, 12))).toBe("shop");
    expect(["house", "villa"]).toContain(kind(building(-900, 900, 10, 10)));
    // 높이 태그가 있으면 추정하지 않는다.
    expect(
      kindHeight(
        building(0, 0, 10, 10, { height: 21, guessed: false }),
        "villa",
      ),
    ).toBe(21);
  });
});

describe("건물 부품 형상", () => {
  it("박공지붕 삼각형은 모두 바깥을 향한다", () => {
    const frame = footprintFrame(box(10, -20, 12, 8));
    const roof = gableRoof(frame, 7, new Color("#b4523f"));
    const position = roof.getAttribute("position");
    expect(position.count).toBe(18);
    for (let index = 0; index < position.count; index += 3) {
      const [a, b, c] = [0, 1, 2].map((offset) => [
        position.getX(index + offset),
        position.getY(index + offset),
        position.getZ(index + offset),
      ]);
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const normal = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ];
      const out = [
        (a[0] + b[0] + c[0]) / 3 - frame.cx,
        (a[1] + b[1] + c[1]) / 3 - 7,
        (a[2] + b[2] + c[2]) / 3 - frame.cz,
      ];
      expect(
        normal[0] * out[0] + normal[1] * out[1] + normal[2] * out[2],
      ).toBeGreaterThan(0);
    }
    roof.dispose();
  });

  it("종류별 벽을 따로 합치고 주택 박공지붕·상가 간판·아파트 옥탑을 붙인다", () => {
    const styled = styleBuildings(
      [
        { ...building(0, 0, 10, 8), hint: "house" as const },
        { ...building(40, 0, 20, 14), hint: "shop" as const },
        { ...building(120, 0, 60, 13), hint: "apartment" as const },
      ],
      [],
      [],
    );
    const merged = cityBuildingGeometry(
      styled,
      buildingPalette(() => "#cccccc"),
    );
    expect(Object.keys(merged?.walls ?? {}).sort()).toEqual([
      "apartment",
      "house",
      "shop",
    ]);
    expect(merged?.signs?.getAttribute("position").count).toBeGreaterThan(0);
    // 지붕 = 박공 18 + 상가 윗면 6 + 아파트 윗면 6 + 옥탑 상자 36 정점.
    expect(merged?.roofs?.getAttribute("position").count).toBe(66);
    for (const part of [...Object.values(merged?.walls ?? {}), merged?.roofs])
      expect(part?.getAttribute("color").count).toBe(
        part?.getAttribute("position").count,
      );
  });
});

describe("빈 동네 채우기", () => {
  // 100m 간격 격자 골목과 북동쪽 주거 구역이 있는 빈 동네.
  const grid = (): VenueTiles => {
    const roads: VenueLine[] = [];
    for (let at = -600; at <= 600; at += 100) {
      roads.push(road([at, -600], [at, 600]));
      roads.push(road([-600, at], [600, at]));
    }
    return {
      buildings: [],
      roads,
      rails: [],
      areas: [],
      stations: [],
      zones: [{ kind: "residential", points: box(350, -350, 500, 500) }],
    };
  };

  it("길을 피해 필지를 채우고 무대 자리는 비운다", () => {
    const tiles = grid();
    const filled = fillBuildings(tiles, 800);
    expect(filled.length).toBeGreaterThan(200);
    expect(filled.every((item) => item.staged && item.guessed)).toBe(true);
    expect(filled.every(({ x, z }) => Math.hypot(x, z) > 40)).toBe(true);
    // 외곽선 꼭짓점이 모두 길 폭(2.5m) 밖이다 — 격자 길은 100m 배수 좌표.
    const offRoad = (value: number) =>
      Math.abs(value - Math.round(value / 100) * 100) > 2.5;
    for (const item of filled)
      for (const [x, z] of item.footprint ?? [])
        expect(offRoad(x) || offRoad(z)).toBe(true);
    const apartments = filled.filter((item) => item.hint === "apartment");
    expect(apartments.length).toBeGreaterThan(0);
    expect(apartments.every(({ x, z }) => x > 90 && z < -90)).toBe(true);
  });

  it("실제 건물이 있는 칸은 채우지 않는다", () => {
    const tiles = grid();
    for (let x = -550; x <= 550; x += 50)
      for (let z = -550; z <= 550; z += 50)
        tiles.buildings.push(building(x, z, 10, 10));
    expect(fillBuildings(tiles, 800)).toHaveLength(0);
    expect(fillBuildings(grid(), 0)).toHaveLength(0);
  });
});
