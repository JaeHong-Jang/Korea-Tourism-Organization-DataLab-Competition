// 실제 한강 타일 한 장과 경계·경로·시간 규칙을 네트워크 없이 검증한다.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildingPalette,
  cityBuildingGeometry,
} from "../city/building-geometry";
import { styleBuildings } from "../city/building-kind";
import { cityBuildingCap } from "../city/city-buildings";
import { trafficCaps } from "../city/city-traffic";
import { motionSeconds } from "../motion/rail-lines";
import { clipPolygon, clipSegment } from "./clip";
import { tileAt, tilePointToVenue } from "./coordinates";
import {
  graphRoutes,
  pathRoute,
  routeGraph,
  routeSlot,
  vehicleAt,
} from "./routes";
import { sampleEvent } from "./sites";
import { isStationName } from "./tile-tags";
import { readVenueTile, type VenueTiles } from "./tiles";
import { dollCount, venueSun } from "./time";

// 실제 MVT에서 버퍼를 자른 뒤 타일 안쪽 건물과 길이 남는지 확인한다.
describe("행사장 z15 타일", () => {
  it("실제 한강 타일의 건물·도로를 읽고 버퍼 중복을 자른다", () => {
    const bytes = readFileSync(
      new URL("./__fixtures__/hangang-27942-12693.mvt", import.meta.url),
    );
    const data = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    const tiles: VenueTiles = {
      buildings: [],
      roads: [],
      rails: [],
      areas: [],
      stations: [],
    };
    readVenueTile(data, 27942, 12693, [126.98, 37.53], tiles);
    expect(tiles.buildings.length).toBeGreaterThan(0);
    // 동네 3D가 상자 대신 세울 실제 외곽선도 함께 읽는다.
    expect(
      tiles.buildings.every((item) => (item.footprint?.length ?? 0) >= 3),
    ).toBe(true);
    expect(tiles.roads.length).toBeGreaterThan(0);
    expect(tiles.rails.length).toBeGreaterThan(0);
    expect(graphRoutes(routeGraph(tiles.roads)).length).toBeGreaterThan(0);
    expect(
      tiles.buildings.every(
        (building) => building.height >= 2.5 && building.height <= 100,
      ),
    ).toBe(true);
  });

  it("경계 밖 다각형과 선을 정확히 자르고 인접 타일 경계가 같은 좌표다", () => {
    expect(
      clipPolygon(
        [
          [-20, 100],
          [20, 100],
          [20, 200],
          [-20, 200],
        ],
        1000,
      ),
    ).toEqual(
      expect.arrayContaining([
        [0, 100],
        [0, 200],
      ]),
    );
    expect(clipSegment([-100, 50], [1100, 50], 1000)).toEqual([
      [0, 50],
      [1000, 50],
    ]);
    expect(
      tilePointToVenue([4096, 2000], 27942, 12693, [126.98, 37.53]),
    ).toEqual(tilePointToVenue([0, 2000], 27943, 12693, [126.98, 37.53]));
  });

  it("행사 중심의 동·북 변환은 중심에서 0이고 동쪽은 양수다", () => {
    const [tx, ty] = tileAt(126.98, 37.53);
    const center = tilePointToVenue(
      [(tx % 1) * 4096, (ty % 1) * 4096],
      Math.floor(tx),
      Math.floor(ty),
      [126.98, 37.53],
    );
    expect(Math.abs(center[0])).toBeLessThan(0.001);
    expect(Math.abs(center[1])).toBeLessThan(0.001);
    expect(
      tilePointToVenue([3000, 2000], 27942, 12693, [126.98, 37.53])[0],
    ).toBeGreaterThan(
      tilePointToVenue([2000, 2000], 27942, 12693, [126.98, 37.53])[0],
    );
  });
});

// 경로 연결성, 결정적 이동, 품질 상한과 모션 감소를 확인한다.
describe("행사장 연출", () => {
  it("역이 아닌 출입구와 엘리베이터 이름을 목록에서 제외한다", () => {
    expect(isStationName("역")).toBe(false);
    expect(isStationName("운서역 (엘리베이터)")).toBe(false);
    expect(isStationName("인천공항1터미널역 3번 출입구")).toBe(false);
    expect(isStationName("운서역")).toBe(true);
  });
  it("3m 안 끝점을 이은 경로의 같은 시각 위치가 같다", () => {
    const lines = [
      {
        from: [0, 0] as [number, number],
        to: [30, 0] as [number, number],
        kind: "road",
        width: 5,
      },
      {
        from: [31, 0] as [number, number],
        to: [70, 0] as [number, number],
        kind: "road",
        width: 5,
      },
      {
        from: [70, 0] as [number, number],
        to: [100, 0] as [number, number],
        kind: "road",
        width: 5,
      },
    ];
    const graph = routeGraph(lines);
    expect(graph.edges.some((edges) => edges.length === 2)).toBe(true);
    const route = graphRoutes(graph, 1)[0];
    expect(route.length).toBeGreaterThan(40);
    const first = vehicleAt(route, 120, 4, true, { x: 0, z: 0, heading: 0 });
    const second = vehicleAt(route, 120, 4, true, { x: 0, z: 0, heading: 0 });
    expect(first).toEqual(second);
  });

  // 동네 전체 격자 길에서 경로가 행사장 근처가 아니라 네 방향 모두에 퍼진다(9/26 "한쪽에 다 모여 있어")
  it("경로 출발점이 동네 전체에 고르게 퍼진다", () => {
    const lines = [];
    for (let at = -1500; at <= 1500; at += 100)
      for (let step = -1500; step < 1500; step += 100) {
        lines.push({
          from: [at, step] as [number, number],
          to: [at, step + 100] as [number, number],
          kind: "road",
          width: 5,
        });
        lines.push({
          from: [step, at] as [number, number],
          to: [step + 100, at] as [number, number],
          kind: "road",
          width: 5,
        });
      }
    const routes = graphRoutes(routeGraph(lines), 48);
    expect(routes).toHaveLength(48);
    const quadrants = [0, 0, 0, 0];
    for (const route of routes) {
      const [x, z] = route.points[0];
      quadrants[(x < 0 ? 0 : 1) + (z < 0 ? 0 : 2)]++;
    }
    expect(Math.min(...quadrants)).toBeGreaterThanOrEqual(8);
    expect(
      Math.max(...routes.map((route) => Math.hypot(...route.points[0]))),
    ).toBeGreaterThan(1200);
    expect(routes.every((route) => route.length >= 300)).toBe(true);
  });

  // 긴 경로와 근처 경로가 "쓴 길"을 공유하면 어떤 두 경로도 같은 길(선분)을 쓰지 않는다 — 차 겹침 방지
  it("경로끼리 같은 길을 나눠 쓰지 않고 같은 경로의 차는 고르게 벌린다", () => {
    const lines = [];
    for (let at = -800; at <= 800; at += 100)
      for (let step = -800; step < 800; step += 100) {
        lines.push({
          from: [at, step] as [number, number],
          to: [at, step + 100] as [number, number],
          kind: "road",
          width: 5,
        });
        lines.push({
          from: [step, at] as [number, number],
          to: [step + 100, at] as [number, number],
          kind: "road",
          width: 5,
        });
      }
    const graph = routeGraph(lines);
    const used = new Set<string>();
    const routes = [
      ...graphRoutes(graph, 64, 1200, used),
      ...graphRoutes(graph, 300, 300, used),
    ];
    expect(routes.length).toBeGreaterThan(40);
    const seen = new Set<string>();
    for (const route of routes)
      for (let step = 1; step < route.points.length; step++) {
        const [a, b] = [route.points[step - 1], route.points[step]]
          .map((point) => point.join(","))
          .sort();
        const key = `${a}|${b}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    // 7대를 경로 3개에 나누면 경로 안 간격은 1/3(또는 1/2)로 고르고, 경로마다 출발 위상만 다르다.
    const slots = Array.from({ length: 7 }, (_, k) => routeSlot(k, 3, 7));
    const gaps = (route: number) => {
      const spots = slots
        .filter((slot) => slot.route === route)
        .map((slot) => slot.spacing)
        .sort((x, y) => x - y);
      return spots.map(
        (spot, index) => (spots[(index + 1) % spots.length] - spot + 1) % 1,
      );
    };
    for (const gap of gaps(0)) expect(gap).toBeCloseTo(1 / 3, 6);
    for (const gap of gaps(1)) expect(gap).toBeCloseTo(1 / 2, 6);
    expect(slots[0].spacing).not.toBeCloseTo(slots[1].spacing, 3);
  });

  // 귀가 길은 격자 길에서 길이 가중 최단 경로이며, 이어지지 않으면 만들지 않는다
  it("두 점 사이 최단 걸음 경로를 찾는다", () => {
    const lines = [];
    for (let at = 0; at <= 400; at += 100)
      for (let step = 0; step < 400; step += 100) {
        lines.push({
          from: [at, step] as [number, number],
          to: [at, step + 100] as [number, number],
          kind: "road",
          width: 5,
        });
        lines.push({
          from: [step, at] as [number, number],
          to: [step + 100, at] as [number, number],
          kind: "road",
          width: 5,
        });
      }
    const graph = routeGraph(lines);
    const route = pathRoute(graph, [0, 0], [300, 200], "역 가는 길");
    expect(route?.length).toBeCloseTo(500, 5);
    expect(route?.points[0]).toEqual([0, 0]);
    expect(route?.points.at(-1)).toEqual([300, 200]);
    const apart = routeGraph([
      ...lines,
      { from: [900, 900], to: [950, 900], kind: "road", width: 5 },
    ]);
    expect(pathRoute(apart, [0, 0], [940, 900], "끊긴 길")).toBeNull();
  });

  it("품질 상한과 모션 감소 정지를 지킨다", () => {
    expect(cityBuildingCap("low")).toBeLessThan(cityBuildingCap("high"));
    expect(cityBuildingCap("high")).toBeLessThanOrEqual(2200);
    // 실제 외곽선 두 채를 한 형상으로 합치고 칸마다 색을 칠한다.
    const square = (x: number): [number, number][] => [
      [x, 0],
      [x + 8, 0],
      [x + 8, 8],
      [x, 8],
    ];
    const merged = cityBuildingGeometry(
      styleBuildings(
        [
          {
            x: 4,
            z: 4,
            width: 8,
            depth: 8,
            height: 19,
            minHeight: 0,
            footprint: square(0),
          },
          {
            x: 24,
            z: 4,
            width: 8,
            depth: 8,
            height: 21,
            minHeight: 0,
            footprint: square(20),
          },
        ],
        [],
        [],
      ),
      buildingPalette(() => "#cccccc"),
    );
    // 벽(종류별, 창문 그림용 UV 포함)과 지붕을 따로 모으고 칸마다 색을 칠한다.
    const walls = Object.values(merged?.walls ?? {});
    expect(walls.length).toBeGreaterThan(0);
    for (const part of [...walls, merged?.roofs]) {
      expect(part?.getAttribute("color")?.count).toBe(
        part?.getAttribute("position")?.count,
      );
      part?.dispose();
    }
    expect(walls[0]?.getAttribute("uv")).toBeDefined();
    expect(trafficCaps("high").cars).toBeLessThanOrEqual(500);
    expect(trafficCaps("low").cars).toBeLessThan(trafficCaps("high").cars);
    expect(dollCount(100000, 19, [{ hour: 19, share: 1 }], "low").count).toBe(
      125,
    );
    expect(motionSeconds(10, true)).toBe(motionSeconds(200, true));
  });

  it("행사 날짜의 정오와 밤은 서로 다른 해 상태다", () => {
    const event = sampleEvent("hangang");
    expect(venueSun(event, 12).sky).toBe("day");
    expect(venueSun(event, 23).sky).toBe("night");
  });
});
