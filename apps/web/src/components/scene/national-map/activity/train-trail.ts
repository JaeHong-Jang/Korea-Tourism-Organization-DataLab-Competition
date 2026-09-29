// 연결된 철도의 지나온 경로를 보존해 열차가 생성될 때부터 곡선 위에 모든 객차를 놓는다.
import type { Citizen } from "./simulation";
import type { Network } from "./network";

// 최초 편성 뒤쪽의 연결 경로를 채우며 철도가 끝나면 존재하는 구간만 사용한다.
export function seedTrainTrail(actor: Citizen, network: Network) {
  let edge = actor.edge,
    x = actor.x,
    z = actor.z,
    remaining = 0.075;
  const trail: Citizen["trail"] = [];
  for (let part = 0; part < 48 && remaining > 0; part++) {
    const length = Math.hypot(x - edge.a[0], z - edge.a[1]);
    const usable = Math.min(length, remaining),
      steps = Math.max(1, Math.ceil(usable / 0.003));
    const heading = Math.atan2(edge.b[0] - edge.a[0], edge.b[1] - edge.a[1]);
    for (let i = 1; i <= steps; i++) {
      const t = (usable * i) / steps / (length || 1);
      trail.push([x + (edge.a[0] - x) * t, z + (edge.a[1] - z) * t, heading]);
    }
    remaining -= usable;
    x = edge.a[0];
    z = edge.a[1];
    const backward = (network.out.get(edge.from) ?? []).find(
      (e) => e.to !== edge.to,
    );
    if (!backward) break;
    const previous = network.edges.get(`rail:${backward.to}>${backward.from}`);
    if (!previous) break;
    edge = previous;
  }
  actor.trail = trail;
}

// 각 객차는 기관차가 실제로 지나온 곡선의 누적 거리만큼 뒤에 놓인다.
export function trailingPoint(actor: Citizen, distance: number) {
  let px = actor.x,
    pz = actor.z,
    length = 0;
  if (distance === 0) return [px, pz, actor.heading];
  for (const point of actor.trail) {
    const step = Math.hypot(point[0] - px, point[1] - pz);
    if (length + step >= distance) {
      const t = (distance - length) / (step || 1);
      return [
        px + (point[0] - px) * t,
        pz + (point[1] - pz) * t,
        Math.atan2(px - point[0], pz - point[1]),
      ];
    }
    length += step;
    px = point[0];
    pz = point[1];
  }
  return null;
}
