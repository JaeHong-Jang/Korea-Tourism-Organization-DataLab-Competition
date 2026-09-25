// 확대해서 보는 곳 근처의 짧은 경로를 골라 두고, 보는 곳이 100m 넘게 옮겨질 때만 다시 고른다.
import type { MotionRoute } from "../motion/rail-lines";

export type Focus = { x: number; z: number; routes: MotionRoute[] };

export function newFocus(): Focus {
  return { x: Number.NaN, z: Number.NaN, routes: [] };
}

// 다시 골랐으면 true — 부른 쪽은 그때 한 번 다시 배치한다(움직임 줄이기에서도 보는 곳을 따라가게).
export function refocus(
  focus: Focus,
  pool: MotionRoute[],
  x: number,
  z: number,
  radius = 350,
) {
  if (Math.hypot(x - focus.x, z - focus.z) < 100) return false;
  focus.x = x;
  focus.z = z;
  focus.routes = pool.filter(({ points }) =>
    points.some(([px, pz]) => Math.hypot(px - x, pz - z) < radius),
  );
  return true;
}
