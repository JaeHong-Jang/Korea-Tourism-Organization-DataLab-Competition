// 차·택시·버스·열차 칸을 부품(차체·유리·지붕·바퀴·등) 행렬로 적는 공용 도구 — 동네 3D와 전국 판이 같이 쓴다.
import { type Pose, stamp } from "./stamp";

type Matrices = { [index: number]: number } | undefined;

export type Kind = "car" | "taxi" | "bus";
// 12대 중 1대는 버스, 5대 중 1대는 택시(나머지 승용차).
export function kindOf(index: number): Kind {
  return index % 12 === 0 ? "bus" : index % 5 === 0 ? "taxi" : "car";
}

// 차종별 치수(m, 길이 방향 = +z): 차체·유리 띠·지붕의 높이와 길이.
export const SIZES = {
  car: {
    w: 1.8,
    l: 4.3,
    bodyH: 0.7,
    bodyY: 0.55,
    glassY: 1.17,
    glassH: 0.55,
    glassL: 2.3,
    glassZ: -0.2,
    roofY: 1.49,
    roofL: 2.1,
  },
  taxi: {
    w: 1.8,
    l: 4.5,
    bodyH: 0.7,
    bodyY: 0.55,
    glassY: 1.17,
    glassH: 0.55,
    glassL: 2.3,
    glassZ: -0.2,
    roofY: 1.49,
    roofL: 2.1,
  },
  bus: {
    w: 2.5,
    l: 11,
    bodyH: 2.2,
    bodyY: 1.45,
    glassY: 1.95,
    glassH: 0.9,
    glassL: 10.4,
    glassZ: 0,
    roofY: 2.6,
    roofL: 10.8,
  },
} as const;

// 한 대의 부품 행렬 — detail 0은 차체·유리·지붕, 1은 바퀴까지, 2는 전조등·후미등·택시 표시등까지.
export function stampCar(
  parts: {
    body: Matrices;
    glass: Matrices;
    roof: Matrices;
    wheel?: Matrices;
    head?: Matrices;
    tail?: Matrices;
    sign?: Matrices;
  },
  index: number,
  pose: Pose,
  detail: 0 | 1 | 2,
) {
  const { body, glass, roof, wheel, head, tail, sign } = parts;
  if (!body || !glass || !roof) return;
  const kind = kindOf(index);
  const size = SIZES[kind];
  const bus = kind === "bus" ? 1.02 : 0.9;
  stamp(body, index, pose, [0, size.bodyY, 0], [size.w, size.bodyH, size.l]);
  stamp(
    glass,
    index,
    pose,
    [0, size.glassY, size.glassZ],
    [size.w * bus, size.glassH, size.glassL],
  );
  stamp(
    roof,
    index,
    pose,
    [0, size.roofY, size.glassZ],
    [size.w * 0.94, 0.1, size.roofL],
  );
  if (detail === 0 || !wheel) return;
  const wheelZ = size.l * 0.32;
  for (let item = 0; item < 4; item++)
    stamp(
      wheel,
      index * 4 + item,
      pose,
      [
        (item % 2 === 0 ? -1 : 1) * size.w * 0.48,
        0.33,
        (item < 2 ? -1 : 1) * wheelZ,
      ],
      [0.26, 0.66, 0.66],
    );
  if (detail === 1 || !head || !tail || !sign) return;
  for (let side = 0; side < 2; side++) {
    const x = (side === 0 ? -1 : 1) * size.w * 0.32;
    stamp(
      head,
      index * 2 + side,
      pose,
      [x, size.bodyY + 0.1, size.l / 2 + 0.02],
      [0.36, 0.16, 0.05],
    );
    stamp(
      tail,
      index * 2 + side,
      pose,
      [x, size.bodyY + 0.1, -size.l / 2 - 0.02],
      [0.32, 0.14, 0.05],
    );
  }
  // 택시만 지붕 표시등을 보이고 나머지는 크기 0으로 숨긴다.
  const shown = kind === "taxi" ? 1 : 0;
  stamp(
    sign,
    index,
    pose,
    [0, size.roofY + 0.14, size.glassZ],
    [0.5 * shown, 0.2 * shown, 0.28 * shown],
  );
}

// 열차 한 칸은 흰 차체·파란 띠·창 띠·회색 지붕 네 부품이다(길이 약 18m).
export function stampCart(
  parts: { body: Matrices; stripe: Matrices; glass: Matrices; roof: Matrices },
  index: number,
  pose: Pose,
) {
  const { body, stripe, glass, roof } = parts;
  if (!body || !stripe || !glass || !roof) return;
  stamp(body, index, pose, [0, 1.9, 0], [3, 3.2, 18.4]);
  stamp(stripe, index, pose, [0, 1.15, 0], [3.04, 0.35, 18.2]);
  stamp(glass, index, pose, [0, 2.45, 0], [3.05, 0.9, 16.6]);
  stamp(roof, index, pose, [0, 3.6, 0], [2.7, 0.25, 18]);
}
