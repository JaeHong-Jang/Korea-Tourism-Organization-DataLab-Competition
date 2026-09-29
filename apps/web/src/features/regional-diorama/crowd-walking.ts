// 장애물이 없는 경로를 따라 관람객이 목적지를 바꾸고 쉬었다 걷는 상태를 계산한다.
import { seededRandom } from "../../components/scene/city/free-space";
import type { Point } from "../../components/scene/venue/coordinates";
import type { VenueTiles } from "../../components/scene/venue/tiles";
import {
  crowdBlocked,
  festivalCrowdPositions,
} from "./festival-crowd-placement";

// 경로 중간도 검사해 건물 모서리나 좁은 차도를 건너뛰지 않는다.
export function clearWalk(
  from: Point,
  to: Point,
  blocked: (x: number, z: number) => boolean,
) {
  const steps = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]));
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0;
    if (
      blocked(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t)
    )
      return false;
  }
  return true;
}

// 짧은 왕복 대신 8~32m 떨어진 다음 목적지를 각각 독립적으로 고른다.
export type CrowdGoal = { point: Point; kind: "watch" | "queue" | "rest" };
export function createCrowdWalk(
  tiles: VenueTiles,
  center: Point,
  goals: CrowdGoal[] = [],
  limit = 360,
  allowed?: (x: number, z: number) => boolean,
) {
  const obstacles = crowdBlocked(tiles, center);
  const blocked = (x: number, z: number) =>
    obstacles(x, z) || allowed?.(x, z) === false;
  const random = seededRandom(7193);
  const people = festivalCrowdPositions(tiles, center)
    .filter(([x, z]) => !blocked(x, z))
    .slice(0, limit)
    .map(([x, z], i) => ({
      id: i,
      companion: -1,
      activity: "walk" as "walk" | "watch" | "queue" | "rest",
      x,
      z,
      tx: x,
      tz: z,
      heading: random() * Math.PI * 2,
      speed: 1.1 + random() * 0.9,
      wait: i % 6 === 0 ? random() * 5 : 0,
      moving: false,
      blockedFor: 0,
      stride: random() * 6.28,
    }));
  // 일부 관람객은 두세 명씩 가까이 출발하고 같은 일행의 다음 목적지를 따라간다.
  for (const person of people) {
    const member = person.id % 9;
    if (member !== 1 && member !== 2) continue;
    const leader = people[person.id - member],
      x = leader.x + member * 1.9,
      z = leader.z + 1.5;
    if (blocked(x, z) || !clearWalk([leader.x, leader.z], [x, z], blocked))
      continue;
    person.x = person.tx = x;
    person.z = person.tz = z;
    person.speed = leader.speed;
    person.companion = leader.id;
  }
  // 후보를 제한해 막힌 지역에서도 프레임당 탐색량이 폭증하지 않게 한다.
  const destination = (person: (typeof people)[number]) => {
    const leader = people[person.companion];
    if (leader && random() < 0.85) {
      const x = leader.tx + (person.id % 9) * 1.9,
        z = leader.tz + 1.5;
      if (
        Math.hypot(x - person.x, z - person.z) > 1 &&
        clearWalk([person.x, person.z], [x, z], blocked)
      ) {
        person.tx = x;
        person.tz = z;
        person.activity = leader.activity;
        return true;
      }
    }
    if (goals.length && random() < 0.7) {
      const goal =
        goals[Math.floor(person.id / 3 + random() * 3) % goals.length];
      const x = goal.point[0] + ((person.id % 5) - 2) * 2,
        z = goal.point[1] + Math.floor((person.id % 15) / 5) * 2;
      if (clearWalk([person.x, person.z], [x, z], blocked)) {
        person.tx = x;
        person.tz = z;
        person.activity = goal.kind;
        return true;
      }
    }
    for (let attempt = 0; attempt < 16; attempt++) {
      const angle = person.heading + (random() - 0.5) * Math.PI * 2;
      const distance = 8 + random() * 24;
      const x = person.x + Math.sin(angle) * distance;
      const z = person.z + Math.cos(angle) * distance;
      if (
        Math.abs(x - center[0]) > 170 ||
        Math.abs(z - center[1]) > 170 ||
        !clearWalk([person.x, person.z], [x, z], blocked)
      )
        continue;
      person.tx = x;
      person.tz = z;
      person.activity = "walk";
      return true;
    }
    person.wait = 1 + random() * 3;
    return false;
  };
  // 누적 이동 거리에 보행 주기를 맞추고 정지할 때는 팔다리도 멈춘다.
  const step = (delta: number, active = people.length) => {
    const dt = Math.min(Math.max(delta, 0), 0.1);
    const cells = new Map<string, typeof people>();
    for (let i = 0; i < Math.min(active, people.length); i++) {
      const person = people[i];
      const key = `${Math.floor(person.x / 2)},${Math.floor(person.z / 2)}`,
        cell = cells.get(key) ?? [];
      cell.push(person);
      cells.set(key, cell);
    }
    for (let i = 0; i < Math.min(active, people.length); i++) {
      const person = people[i];
      person.moving = false;
      if (person.wait > 0) {
        person.wait -= dt;
        continue;
      }
      let distance = Math.hypot(person.tx - person.x, person.tz - person.z);
      if (distance < 0.05) {
        if (!destination(person)) continue;
        distance = Math.hypot(person.tx - person.x, person.tz - person.z);
      }
      const heading = Math.atan2(person.tx - person.x, person.tz - person.z);
      const turn = Math.atan2(
        Math.sin(heading - person.heading),
        Math.cos(heading - person.heading),
      );
      person.heading += Math.max(-dt * 2, Math.min(dt * 2, turn));
      if (Math.abs(turn) > 0.4) continue;
      const travel = Math.min(distance, person.speed * dt);
      const nx = person.x + ((person.tx - person.x) / distance) * travel,
        nz = person.z + ((person.tz - person.z) / distance) * travel;
      let occupied = false;
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++)
          for (const other of cells.get(
            `${Math.floor(nx / 2) + dx},${Math.floor(nz / 2) + dz}`,
          ) ?? [])
            if (
              other.id < person.id &&
              Math.hypot(other.x - nx, other.z - nz) < 1.4
            )
              occupied = true;
      if (occupied) {
        person.blockedFor += 0.3;
        person.wait = 0.3;
        if (person.blockedFor > 2) {
          destination(person);
          person.blockedFor = 0;
        }
        continue;
      }
      person.blockedFor = 0;
      person.x += ((person.tx - person.x) / distance) * travel;
      person.z += ((person.tz - person.z) / distance) * travel;
      person.stride += travel * 3.5;
      person.moving = true;
      if (
        distance - travel < 0.05 &&
        (person.activity !== "walk" || random() < 0.32)
      )
        person.wait =
          person.activity === "watch"
            ? 12 + random() * 18
            : person.activity === "rest"
              ? 10 + random() * 10
              : person.activity === "queue"
                ? 5 + random() * 8
                : 1.5 + random() * 5;
    }
  };
  return { people, step };
}
