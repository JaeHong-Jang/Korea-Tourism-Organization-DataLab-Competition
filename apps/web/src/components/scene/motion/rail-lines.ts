// 전국 판 연출 경로(철도·고속도로축)를 내보내고 연출용 왕복 위치를 결정한다.
import { highways, railways } from "./national-network";

export type MotionPoint = { x: number; z: number; heading: number };
export type MotionRoute = {
  name: string;
  points: [number, number][];
  lengths: number[];
  length: number;
};

// 역 사이를 직선으로 이은 선이며 실제 철도 선형이나 운행 위치가 아니다(전국 교통망 연출 목록).
export const railLines = railways;

// 차량 길도 실제 도로가 아닌 주요 도시를 이은 연출용 고속도로축이다.
export const roadRoutes = highways;

// 같은 시각은 같은 선분과 방향을 주며 끝점에서는 반대 방향으로 돌아온다.
export function routePosition(
  line: MotionRoute,
  seconds: number,
  speed: number,
  offset: number,
  out: MotionPoint,
): MotionPoint {
  const period = line.length * 2;
  const distance = (((seconds * speed + offset) % period) + period) % period;
  const backwards = distance > line.length;
  const travelled = backwards ? period - distance : distance;
  let index = 1;
  while (index < line.lengths.length - 1 && line.lengths[index] < travelled)
    index++;
  const from = line.points[index - 1];
  const to = line.points[index];
  const ratio =
    (travelled - line.lengths[index - 1]) /
    (line.lengths[index] - line.lengths[index - 1]);
  out.x = from[0] + (to[0] - from[0]) * ratio;
  out.z = from[1] + (to[1] - from[1]) * ratio;
  out.heading = Math.atan2(
    backwards ? from[0] - to[0] : to[0] - from[0],
    backwards ? from[1] - to[1] : to[1] - from[1],
  );
  return out;
}

// 움직임 줄이기 설정은 시각을 고정해 첫 프레임의 배치를 유지한다.
export function motionSeconds(seconds: number, reducedMotion: boolean): number {
  return reducedMotion ? 0 : seconds;
}
