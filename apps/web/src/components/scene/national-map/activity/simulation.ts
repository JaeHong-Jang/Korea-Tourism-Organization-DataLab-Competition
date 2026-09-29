// 이동 객체를 타일 갱신과 분리해 유지하고 연결된 경로·간격·정차를 계산한다.
import { seededRandom } from "../../city/free-space";
import type { Edge, Network } from "./network";
import { inWindow, type ActivityWindow } from "./window";
import { seedTrainTrail } from "./train-trail";
export type Citizen = {
  id: number;
  edge: Edge;
  distance: number;
  x: number;
  z: number;
  heading: number;
  speed: number;
  wait: number;
  stride: number;
  moving: boolean;
  fade: number;
  age: number;
  state: "walking" | "looking" | "waiting";
  trail: [number, number, number][];
};
const turn = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

// 이동량을 누적하고 경로 끝에서 시간 나머지 연산으로 출발점에 되돌리지 않는다.
export class ActivitySimulation {
  actors: Citizen[] = [];
  network: Network = { edges: new Map(), out: new Map() };
  random = seededRandom(7919);
  nextId = 0;
  elapsed = 0;
  cursor = 0;
  candidateWindow: ActivityWindow | null = null;
  candidates: Edge[] = [];
  lanes = new Map<string, Citizen[]>();
  peopleCells = new Map<string, Citizen[]>();
  constructor(
    public mode: "car" | "walk" | "rail",
    public pace = 1,
  ) {}
  update(network: Network) {
    this.network = network;
    this.candidateWindow = null;
    this.lanes.clear();
    this.peopleCells.clear();
    for (const actor of this.actors)
      actor.edge = network.edges.get(actor.edge.id) ?? actor.edge;
  }
  // 부하가 한 프레임에 몰리지 않도록 후보를 나누어 채우고 가까운 기존 객체는 그대로 둔다.
  populate(window: ActivityWindow, limit: number, maximum = 10) {
    this.actors = this.actors.filter((a) =>
      inWindow([a.x, a.z], window, window.width * 0.2),
    );
    if (this.actors.length > limit) this.actors.length = limit;
    if (this.candidateWindow !== window) {
      this.candidates = [...this.network.edges.values()].filter((e) =>
        inWindow([(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2], window),
      );
      this.candidateWindow = window;
    }
    const candidates = this.candidates;
    if (!candidates.length) return;
    for (let n = 0; n < maximum && this.actors.length < limit; n++) {
      const edge = candidates[(this.cursor++ * 7919) % candidates.length];
      if (this.mode === "rail" && edge.length < 0.03) continue;
      const distance = edge.length * this.random();
      const gap =
        this.mode === "walk" ? 0.0018 : this.mode === "rail" ? 0.12 : 0.025;
      if (
        this.actors.some(
          (a) => a.edge.id === edge.id && Math.abs(a.distance - distance) < gap,
        )
      )
        continue;
      const t = distance / edge.length,
        id = this.nextId++;
      const actor: Citizen = {
        id,
        edge,
        distance,
        x: edge.a[0] + (edge.b[0] - edge.a[0]) * t,
        z: edge.a[1] + (edge.b[1] - edge.a[1]) * t,
        heading: Math.atan2(edge.b[0] - edge.a[0], edge.b[1] - edge.a[1]),
        speed: 0,
        wait: this.mode === "walk" && id % 7 === 0 ? 3 : 0,
        stride: id,
        moving: false,
        fade: 0,
        age: 0,
        state: "walking",
        trail: [],
      };
      if (
        this.mode === "walk" &&
        this.actors.some(
          (a) => Math.hypot(a.x - actor.x, a.z - actor.z) < 0.0018,
        )
      )
        continue;
      if (this.mode === "rail" && this.pace === 1)
        seedTrainTrail(actor, this.network);
      this.actors.push(actor);
    }
  }
  // 차간 간격과 보행 간격은 같은 방향의 선분별 정렬로 계산해 전체 쌍 비교를 피한다.
  step(delta: number) {
    const dt = Math.min(0.1, Math.max(0, delta));
    this.elapsed += dt;
    const lanes = this.lanes,
      peopleCells = this.peopleCells;
    for (const lane of lanes.values()) lane.length = 0;
    for (const cell of peopleCells.values()) cell.length = 0;
    if (peopleCells.size > this.actors.length * 8) peopleCells.clear();
    for (const actor of this.actors) {
      const lane = lanes.get(actor.edge.id) ?? [];
      lane.push(actor);
      lanes.set(actor.edge.id, lane);
      if (this.mode === "walk") {
        const key = `${Math.floor(actor.x / 0.002)},${Math.floor(actor.z / 0.002)}`,
          cell = peopleCells.get(key) ?? [];
        cell.push(actor);
        peopleCells.set(key, cell);
      }
    }
    for (const lane of lanes.values())
      lane.sort((a, b) => b.distance - a.distance);
    for (const actor of this.actors) {
      actor.age += dt;
      actor.fade = Math.min(1, actor.fade + dt * 1.8);
      actor.moving = false;
      if (actor.wait > 0) {
        actor.wait -= dt;
        actor.speed = 0;
        continue;
      }
      const edge = actor.edge,
        remaining = edge.length - actor.distance;
      let speed =
        this.mode === "walk"
          ? 0.0011 + (actor.id % 5) * 0.00015
          : this.mode === "rail"
            ? 0.016
            : edge.kind === "highway"
              ? 0.02
              : actor.id % 12 === 0
                ? 0.006
                : 0.009;
      speed *= this.pace;
      if (
        this.mode === "walk" &&
        Math.abs(
          turn(
            Math.atan2(edge.b[0] - edge.a[0], edge.b[1] - edge.a[1]) -
              actor.heading,
          ),
        ) > 0.4
      )
        speed = 0;
      const ahead = lanes.get(edge.id)!,
        index = ahead.indexOf(actor),
        leader = ahead[index - 1];
      const separation =
        this.mode === "walk" ? 0.0014 : this.mode === "rail" ? 0.1 : 0.014;
      if (leader)
        speed = Math.min(
          speed,
          Math.max(0, (leader.distance - actor.distance - separation) * 0.7),
        );
      if (this.mode === "walk") {
        const cx = Math.floor(actor.x / 0.002),
          cz = Math.floor(actor.z / 0.002);
        for (let dx = -1; dx <= 1; dx++)
          for (let dz = -1; dz <= 1; dz++)
            for (const other of peopleCells.get(`${cx + dx},${cz + dz}`) ??
              []) {
              if (other.id === actor.id || other.id > actor.id) continue;
              if (Math.hypot(other.x - actor.x, other.z - actor.z) < 0.0012)
                speed = 0;
            }
      }
      const choices = this.network.out.get(edge.to) ?? [];
      const hash = [...edge.to].reduce((sum, c) => sum + c.charCodeAt(0), 0);
      // 실제 신호 데이터가 없는 교차로에는 연출용 양보 정차만 적용한다.
      if (
        this.mode === "car" &&
        choices.length > 2 &&
        remaining < 0.035 &&
        (this.elapsed + hash) % 18 < 4
      )
        speed = Math.min(speed, Math.max(0, (remaining - 0.002) * 0.8));
      actor.speed += Math.max(
        -dt * 0.015,
        Math.min(
          dt * (this.mode === "walk" ? 0.003 : 0.004),
          speed - actor.speed,
        ),
      );
      const travel = Math.min(remaining, actor.speed * dt);
      actor.distance += travel;
      actor.stride += travel * 3500;
      actor.moving = travel > 0.000001;
      const t = actor.distance / edge.length,
        dx = (edge.b[0] - edge.a[0]) / edge.length,
        dz = (edge.b[1] - edge.a[1]) / edge.length;
      const lane =
        this.mode === "car"
          ? Math.min(0.003, edge.width / 4) *
            Math.min(
              1,
              actor.distance / 0.01,
              (edge.length - actor.distance) / 0.01,
            )
          : 0;
      actor.x = edge.a[0] + dx * actor.distance - dz * lane;
      actor.z = edge.a[1] + dz * actor.distance + dx * lane;
      const desired = Math.atan2(dx, dz);
      actor.heading += Math.max(
        -dt * 2,
        Math.min(dt * 2, turn(desired - actor.heading)),
      );
      actor.state = actor.moving ? "walking" : "waiting";
      if (
        this.mode === "rail" &&
        this.pace === 1 &&
        actor.moving &&
        (!actor.trail[0] ||
          Math.hypot(actor.x - actor.trail[0][0], actor.z - actor.trail[0][1]) >
            0.002)
      ) {
        actor.trail.unshift([actor.x, actor.z, actor.heading]);
        if (actor.trail.length > 96) actor.trail.length = 96;
      }
      if (t >= 1 - 1e-6) {
        const onward = choices.filter((e) => e.to !== edge.from),
          options = onward.length ? onward : choices;
        if (!options.length) {
          actor.wait = 2;
          actor.state = "looking";
          continue;
        }
        const sorted = [...options].sort(
          (a, b) =>
            Math.abs(
              turn(Math.atan2(a.b[0] - a.a[0], a.b[1] - a.a[1]) - desired),
            ) -
            Math.abs(
              turn(Math.atan2(b.b[0] - b.a[0], b.b[1] - b.a[1]) - desired),
            ),
        );
        actor.edge =
          sorted[
            this.mode === "walk"
              ? Math.floor(this.random() * sorted.length)
              : this.random() < 0.8
                ? 0
                : Math.floor(this.random() * sorted.length)
          ];
        actor.distance = 0;
        if (this.mode === "walk" && this.random() < 0.35) {
          actor.wait = 2 + this.random() * 7;
          actor.state = "looking";
        }
        if (this.mode === "car" && actor.id % 12 === 0 && this.random() < 0.2)
          actor.wait = 3 + this.random() * 4;
        if (!onward.length) {
          actor.wait = Math.max(actor.wait, this.mode === "rail" ? 8 : 2);
          actor.speed = 0;
        }
      }
    }
  }
}
