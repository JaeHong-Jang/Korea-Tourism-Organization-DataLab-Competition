// 경로 방향·장애물·화면 상태 보존·열차 편성의 핵심 불변식을 검증한다.
import { describe, expect, it } from "vitest";
import type { MapRoad, MapTile } from "../types";
import { buildNetwork } from "./network";
import { obstacleIndex } from "./obstacles";
import { ActivitySimulation } from "./simulation";
import { seedTrainTrail, trailingPoint } from "./train-trail";
import { activityCaps, activityWindow } from "./window";
const road = (
  points: MapRoad["points"],
  kind = "minor_road",
  oneway?: 1 | -1,
): MapRoad => ({ points, kind, oneway, width: 0.008, name: "검증 도로" });
const tile = (roads: MapRoad[] = []): MapTile => ({
  roads,
  buildings: [],
  areas: [],
  places: [],
});
const window = { minX: -1, maxX: 1, minZ: -1, maxZ: 1, width: 2 };

describe("도시 경로", () => {
  it("일방통행 방향을 지키고 철도를 차도에 포함하지 않는다", () => {
    const data = tile([
      road(
        [
          [0, 0],
          [0.1, 0],
        ],
        "minor_road",
        1,
      ),
      road(
        [
          [0, 0],
          [0, 0.1],
        ],
        "rail",
      ),
    ]);
    const cars = buildNetwork(data, "car");
    expect(cars.edges.size).toBe(1);
    expect([...cars.edges.values()][0].a).toEqual([0, 0]);
    data.roads[0].oneway = -1;
    expect([...buildNetwork(data, "car").edges.values()][0].b).toEqual([0, 0]);
    expect(buildNetwork(data, "rail").edges.size).toBe(2);
  });
  it("양 끝이 비어 있어도 건물·수면·차도를 가로지르는 보행로는 제외한다", () => {
    const data = tile([
      road(
        [
          [-0.1, 0],
          [0.1, 0],
        ],
        "path",
      ),
    ]);
    const square: [number, number][] = [
      [-0.01, -0.01],
      [0.01, -0.01],
      [0.01, 0.01],
      [-0.01, 0.01],
    ];
    data.areas = [{ kind: "water", polygons: [[square]] }];
    expect(buildNetwork(data, "walk").edges.size).toBe(0);
    data.areas = [];
    data.roads.push(
      road([
        [0, -0.1],
        [0, 0.1],
      ]),
    );
    expect(
      [...buildNetwork(data, "walk").edges.values()].some(
        (e) => e.a[0] === -0.1 && e.b[0] === 0.1,
      ),
    ).toBe(false);
  });
  it("수면의 구멍인 섬은 장애물로 간주하지 않는다", () => {
    const data = tile();
    data.areas = [
      {
        kind: "water",
        polygons: [
          [
            [
              [-0.2, -0.2],
              [0.2, -0.2],
              [0.2, 0.2],
              [-0.2, 0.2],
            ],
            [
              [-0.05, -0.05],
              [0.05, -0.05],
              [0.05, 0.05],
              [-0.05, 0.05],
            ],
          ],
        ],
      },
    ];
    const blocked = obstacleIndex(data);
    expect(blocked([0, 0])).toBe(false);
    expect(blocked([0.1, 0])).toBe(true);
  });
  it("선분 끝에서 출발점으로 되돌리지 않고 연결된 다음 도로로 진행한다", () => {
    const sim = new ActivitySimulation("car");
    sim.update(
      buildNetwork(
        tile([
          road(
            [
              [0, 0],
              [0.05, 0],
              [0.05, 0.1],
            ],
            "minor_road",
            1,
          ),
        ]),
        "car",
      ),
    );
    sim.populate(window, 1);
    const actor = sim.actors[0];
    actor.edge = [...sim.network.edges.values()][0];
    actor.distance = 0.049;
    actor.x = 0.049;
    actor.z = 0;
    actor.speed = 0.009;
    let x = actor.x,
      z = actor.z;
    for (let i = 0; i < 100; i++) {
      sim.step(0.05);
      expect(Math.hypot(actor.x - x, actor.z - z)).toBeLessThan(0.004);
      x = actor.x;
      z = actor.z;
    }
    expect(actor.edge.a).toEqual([0.05, 0]);
    expect(actor.distance).toBeGreaterThan(0.02);
  });
  it("지도 데이터와 카메라 범위가 갱신되어도 보이는 객체의 정체성과 이동 상태를 유지한다", () => {
    const data = tile([
        road([
          [0, 0],
          [0.5, 0],
        ]),
      ]),
      sim = new ActivitySimulation("car");
    sim.update(buildNetwork(data, "car"));
    sim.populate(window, 4);
    const original = [...sim.actors];
    sim.step(0.1);
    const distance = original[0].distance;
    sim.update(buildNetwork(data, "car"));
    sim.populate({ ...window, minX: -0.9 }, 4);
    expect(sim.actors[0]).toBe(original[0]);
    expect(sim.actors[0].distance).toBe(distance);
    sim.populate({ ...window, minX: 10, maxX: 11, minZ: 10, maxZ: 11 }, 4);
    expect(sim.actors).toHaveLength(0);
  });
  it("앞차와의 간격을 좁힐 때 감속한다", () => {
    const sim = new ActivitySimulation("car");
    sim.update(
      buildNetwork(
        tile([
          road(
            [
              [0, 0],
              [1, 0],
            ],
            "minor_road",
            1,
          ),
        ]),
        "car",
      ),
    );
    sim.populate(window, 2);
    const [front, back] = sim.actors;
    front.distance = 0.3;
    back.distance = 0.275;
    front.wait = 50;
    for (let i = 0; i < 300; i++) sim.step(0.05);
    expect(front.distance - back.distance).toBeGreaterThan(0.012);
    expect(back.speed).toBeLessThan(0.001);
  });
  it("시작할 때부터 뒤 객차가 연결된 철도의 꺾인 구간에 놓인다", () => {
    const sim = new ActivitySimulation("rail");
    sim.update(
      buildNetwork(
        tile([
          road(
            [
              [0, 0],
              [0.1, 0],
              [0.1, 0.1],
            ],
            "rail",
          ),
        ]),
        "rail",
      ),
    );
    sim.populate(window, 1);
    const a = sim.actors[0];
    a.edge = [...sim.network.edges.values()].find(
      (e) => e.a[0] === 0.1 && e.a[1] === 0 && e.b[1] === 0.1,
    )!;
    a.x = 0.1;
    a.z = 0.01;
    a.distance = 0.01;
    seedTrainTrail(a, sim.network);
    const rear = trailingPoint(a, 0.046)!;
    expect(rear[1]).toBeCloseTo(0);
    expect(rear[0]).toBeCloseTo(0.064);
  });
  it("전국 화면의 작은 객체는 시뮬레이션하지 않고 화면·품질별 상한을 적용한다", () => {
    expect(activityCaps(1700, "high")).toEqual({
      cars: 0,
      people: 0,
      trains: 0,
    });
    expect(activityCaps(2, "low").people).toBeLessThan(
      activityCaps(2, "high").people,
    );
    expect(activityCaps(2, "high", 400 * 400).cars).toBeLessThan(
      activityCaps(2, "high").cars,
    );
    const bounds = activityWindow({
      center: [127, 37.55],
      bounds: [126.9, 37.5, 127.1, 37.6],
      width: 20,
      zoom: 11,
    });
    expect(bounds.maxX - bounds.minX).toBeGreaterThan(20);
  });
});
