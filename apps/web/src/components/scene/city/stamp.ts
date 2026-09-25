// 여러 부품(몸·머리·바퀴…)으로 된 인형·차를 인스턴스 행렬에 직접 적어 프레임마다 객체를 만들지 않는다.

// 한 인형의 기준점과 방향(0 = +z)과 크기.
export type Pose = {
  x: number;
  y: number;
  z: number;
  heading: number;
  size: number;
};

// 부품 행렬 = 이동(기준점 + 회전된 부품 위치) · Y 회전(방향) · X 회전(흔들림) · 크기.
// three.js 행렬은 열 우선이라 열 세 개(축 방향 × 크기)와 이동을 차례로 적는다.
export function stamp(
  array: { [index: number]: number },
  index: number,
  pose: Pose,
  offset: [number, number, number],
  scale: [number, number, number],
  pitch = 0,
) {
  const c = Math.cos(pose.heading);
  const s = Math.sin(pose.heading);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const k = pose.size;
  const sx = scale[0] * k;
  const sy = scale[1] * k;
  const sz = scale[2] * k;
  const [ox, oy, oz] = offset;
  const at = index * 16;
  array[at] = c * sx;
  array[at + 1] = 0;
  array[at + 2] = -s * sx;
  array[at + 3] = 0;
  array[at + 4] = s * sp * sy;
  array[at + 5] = cp * sy;
  array[at + 6] = c * sp * sy;
  array[at + 7] = 0;
  array[at + 8] = s * cp * sz;
  array[at + 9] = -sp * sz;
  array[at + 10] = c * cp * sz;
  array[at + 11] = 0;
  array[at + 12] = pose.x + (c * ox + s * oz) * k;
  array[at + 13] = pose.y + oy * k;
  array[at + 14] = pose.z + (-s * ox + c * oz) * k;
  array[at + 15] = 1;
}

// 관절(어깨·엉덩이)을 축으로 흔드는 팔다리의 중심 위치 — 관절에서 길이의 절반만큼 아래.
export function swing(
  joint: [number, number, number],
  half: number,
  pitch: number,
): [number, number, number] {
  return [
    joint[0],
    joint[1] - half * Math.cos(pitch),
    joint[2] - half * Math.sin(pitch),
  ];
}
