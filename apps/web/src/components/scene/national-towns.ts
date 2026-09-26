// 전국 판 읍·면 마을(시군구 곳곳)과 고속도로 길가 마을 건물 무리를 정한다 — 도시가 한곳에만 모여 보이지 않게(연출).

import { insidePolygon, seededRandom } from "./city/free-space";
import { clusterSpread, type Tower } from "./city-clusters";
import type { LandAnchor } from "./land-anchor";
import type { MotionRoute } from "./motion/rail-lines";

// 구·시·군마다 읍·면 마을 수, 마을마다 건물 수·높이 범위(km, 과장).
const TOWNS = { gu: 2, si: 4, gun: 5 } as const;
const TOWN = { count: 10, low: 0.5, high: 1.6, size: [0.5, 0.9] } as const;
const ROADSIDE = {
  every: 14,
  count: 5,
  low: 0.22,
  high: 0.6,
  size: [0.24, 0.4],
} as const;

const kindOf = (name: string) =>
  name.endsWith("구") ? "gu" : name.endsWith("시") ? "si" : "gun";

// 가운데 점 둘레 radius 안에 겹치지 않게 건물을 흩는다(땅 밖·길 위·피할 자리는 건너뜀).
function scatter(
  random: () => number,
  center: [number, number],
  radius: number,
  count: number,
  spec: { low: number; high: number; size: readonly [number, number] },
  keep: (x: number, z: number) => boolean,
): Tower[] {
  const placed: Tower[] = [];
  for (
    let attempt = 0;
    placed.length < count && attempt < count * 4;
    attempt++
  ) {
    const angle = random() * Math.PI * 2;
    const reach = radius * Math.sqrt(random());
    const x = center[0] + Math.cos(angle) * reach;
    const z = center[1] + Math.sin(angle) * reach;
    const width = spec.size[0] + random() * (spec.size[1] - spec.size[0]);
    const depth = spec.size[0] + random() * (spec.size[1] - spec.size[0]);
    if (
      !keep(x, z) ||
      placed.some(
        (item) => Math.hypot(item.x - x, item.z - z) < (item.width + width) / 2,
      )
    )
      continue;
    placed.push({
      x,
      z,
      width,
      depth,
      height: spec.low + random() * (spec.high - spec.low),
      tone: random(),
    });
  }
  return placed.sort((a, b) => b.height - a.height);
}

// 점에서 경로 선분까지 가장 가까운 거리.
export function distanceToLines(x: number, z: number, lines: MotionRoute[]) {
  let best = Infinity;
  for (const line of lines)
    for (let index = 1; index < line.points.length; index++) {
      const [ax, az] = line.points[index - 1];
      const [bx, bz] = line.points[index];
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.max(
        0,
        Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)),
      );
      best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
    }
  return best;
}

// 읍·면 마을과 길가 마을 — 무리마다 건물 목록(높은 순)과 마을 가운데 점을 돌려준다.
export function townGroups(
  anchors: Map<string, LandAnchor>,
  avoid: [number, number][],
  roads: MotionRoute[],
  lines: MotionRoute[],
  share: number,
): { groups: Tower[][]; centers: [number, number][]; roadside: number } {
  const groups: Tower[][] = [];
  const centers: [number, number][] = [];
  const clear = (x: number, z: number) =>
    !avoid.some(([ax, az]) => Math.hypot(ax - x, az - z) < 2) &&
    distanceToLines(x, z, lines) > 1.6;
  for (const [code, anchor] of anchors) {
    const random = seededRandom((Number(code) || 1) * 13 + 5);
    const spread = clusterSpread(anchor);
    const inside = (x: number, z: number) =>
      insidePolygon(x, z, anchor.ring) && clear(x, z);
    const want = TOWNS[kindOf(anchor.name)];
    for (
      let town = 0, attempt = 0;
      town < want && attempt < want * 8;
      attempt++
    ) {
      const angle = random() * Math.PI * 2;
      const distance =
        spread * 1.6 + 2 + random() * Math.max(2, anchor.radius * 0.8);
      const center: [number, number] = [
        anchor.x + Math.cos(angle) * distance,
        anchor.z + Math.sin(angle) * distance,
      ];
      if (
        !insidePolygon(center[0], center[1], anchor.ring) ||
        centers.some(
          ([cx, cz]) => Math.hypot(cx - center[0], cz - center[1]) < 5,
        )
      )
        continue;
      const group = scatter(
        random,
        center,
        1.6,
        Math.max(2, Math.round(TOWN.count * share)),
        TOWN,
        inside,
      );
      if (group.length) {
        groups.push(group);
        centers.push(center);
        town++;
      }
    }
  }
  const towns = groups.length;
  // 고속도로를 따라 14km마다 도로 양옆(3~5km)에 작은 길가 마을을 둔다(땅 위인 곳만).
  // 경계 상자로 먼저 거른 뒤에만 외곽선 안쪽을 검사한다(외곽선 점이 많아 전부 훑으면 느리다).
  const boxes = [...anchors.values()].map((anchor) => {
    const xs = anchor.ring.map(([x]) => x);
    const zs = anchor.ring.map(([, z]) => z);
    return {
      ring: anchor.ring,
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
    };
  });
  const onLand = (x: number, z: number) =>
    boxes.some(
      (box) =>
        x >= box.minX &&
        x <= box.maxX &&
        z >= box.minZ &&
        z <= box.maxZ &&
        insidePolygon(x, z, box.ring),
    );
  roads.forEach((road, which) => {
    const random = seededRandom(which * 101 + 7);
    for (let at = ROADSIDE.every / 2; at < road.length; at += ROADSIDE.every) {
      let step = 1;
      while (step < road.lengths.length - 1 && road.lengths[step] < at) step++;
      const [ax, az] = road.points[step - 1];
      const [bx, bz] = road.points[step];
      const ratio =
        (at - road.lengths[step - 1]) /
        (road.lengths[step] - road.lengths[step - 1] || 1);
      const length = Math.hypot(bx - ax, bz - az) || 1;
      const side = random() < 0.5 ? -1 : 1;
      const offset = 3 + random() * 2;
      const center: [number, number] = [
        ax + (bx - ax) * ratio + (-(bz - az) / length) * offset * side,
        az + (bz - az) * ratio + ((bx - ax) / length) * offset * side,
      ];
      if (!onLand(center[0], center[1]) || !clear(center[0], center[1]))
        continue;
      const group = scatter(
        random,
        center,
        1.1,
        Math.max(2, Math.round(ROADSIDE.count * share)),
        ROADSIDE,
        (x, z) => clear(x, z) && onLand(x, z),
      );
      if (group.length) {
        groups.push(group);
        centers.push(center);
      }
    }
  });
  return { groups, centers, roadside: groups.length - towns };
}
