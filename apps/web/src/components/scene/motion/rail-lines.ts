// 공개 역 좌표를 장면에 투영하고 연출용 왕복 위치를 결정한다.
import { projectKorea } from "../projection";

export type MotionPoint = { x: number; z: number; heading: number };
export type MotionRoute = {
  name: string;
  points: [number, number][];
  lengths: number[];
  length: number;
};

// 역 사이를 직선으로 이은 선이며 실제 철도 선형이나 운행 위치가 아니다.
const stations = {
  서울: [126.9707, 37.5547],
  대전: [127.4349, 36.3326],
  동대구: [128.6289, 35.879],
  부산: [129.0435, 35.1151],
  용산: [126.9645, 37.5298],
  광주송정: [126.7914, 35.1378],
  목포: [126.3911, 34.7917],
  강릉: [128.8996, 37.7642],
  인천: [126.616, 37.476],
  수원: [127.0002, 37.2657],
  사상: [128.9858, 35.1628],
  해운대: [129.1589, 35.1632],
} as const;

// 역 이름을 보존하면서 투영 거리의 누적 합을 한 번만 만든다.
function route(name: string, names: (keyof typeof stations)[]): MotionRoute {
  const points = names.map((station) =>
    projectKorea(stations[station][0], stations[station][1]),
  );
  const lengths = [0];
  for (let index = 1; index < points.length; index++) {
    lengths.push(
      lengths[index - 1] +
        Math.hypot(
          points[index][0] - points[index - 1][0],
          points[index][1] - points[index - 1][1],
        ),
    );
  }
  return { name, points, lengths, length: lengths.at(-1) ?? 0 };
}

export const railLines = [
  route("경부 KTX", ["서울", "대전", "동대구", "부산"]),
  route("호남 KTX", ["용산", "광주송정", "목포"]),
  route("강릉 KTX", ["서울", "강릉"]),
];

// 차량 길도 실제 도로가 아닌 주요 역을 이은 연출용 경로다.
export const roadRoutes = [
  ...railLines,
  route("수도권 장난감 길 1", ["인천", "서울", "수원"]),
  route("수도권 장난감 길 2", ["서울", "용산", "수원"]),
  route("부산 장난감 길", ["사상", "부산", "해운대"]),
];

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
