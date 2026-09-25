// 건물 부품 형상 — 돌출 벽·지붕 자르기, 주택 박공지붕, 아파트·오피스 옥탑, 상가 1층 간판(모두 병합용 비색인 형상).
import {
  BoxGeometry,
  BufferGeometry,
  type Color,
  Float32BufferAttribute,
} from "three";
import type { Point } from "../venue/coordinates";
import type { Frame } from "./building-kind";

// 돌출 형상의 무리 0은 아랫면 뒤에 윗면, 무리 1은 옆벽 — 정점 범위만 잘라 새 형상으로 만든다.
// 지붕(무리 0)은 뒤쪽 절반인 윗면만 남긴다(땅에 붙은 아랫면은 보이지 않는데 그리는 비용만 든다).
export function slice(geometry: BufferGeometry, materialIndex: number) {
  const group = geometry.groups.find(
    (item) => item.materialIndex === materialIndex,
  );
  const part = new BufferGeometry();
  if (!group) return part;
  const skip = materialIndex === 0 ? group.count / 2 : 0;
  for (const name of ["position", "normal", "uv"]) {
    const attribute = geometry.getAttribute(name);
    const size = attribute.itemSize;
    part.setAttribute(
      name,
      new Float32BufferAttribute(
        (attribute.array as Float32Array).slice(
          (group.start + skip) * size,
          (group.start + group.count) * size,
        ),
        size,
      ),
    );
  }
  return part;
}

// 정점 색을 한 가지로 칠한다(창문 그림·조명과 곱해진다).
export function paint(geometry: BufferGeometry, color: Color) {
  const count = geometry.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index++)
    colors.set([color.r, color.g, color.b], index * 3);
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return geometry;
}

// 상자 하나를 u축 각도로 돌려 (x, y, z)에 둔다 — 지붕 묶음과 합치도록 UV는 남기고 색을 칠한다.
function orientedBox(
  size: [number, number, number],
  at: [number, number, number],
  angle: number,
  color: Color,
) {
  const box = new BoxGeometry(...size).toNonIndexed();
  box.rotateY(-angle);
  box.translate(...at);
  return paint(box, color);
}

// 둘레 사각형 위에 용마루가 긴 변을 따라가는 박공지붕(비탈 둘·박공 삼각형 둘, 처마 0.4m)을 얹는다.
export function gableRoof(frame: Frame, eave: number, color: Color) {
  const half = frame.length / 2 + 0.4;
  const side = frame.width / 2 + 0.4;
  const rise = Math.min(3.2, Math.max(1.4, frame.width * 0.35));
  // 지역 좌표(u 긴 변, 높이, v 수직)를 세계 좌표로 옮긴다.
  const at = (u: number, y: number, v: number) => [
    frame.cx + u * frame.ux - v * frame.uz,
    eave + y,
    frame.cz + u * frame.uz + v * frame.ux,
  ];
  const a = at(-half, 0, -side);
  const b = at(half, 0, -side);
  const c = at(half, 0, side);
  const d = at(-half, 0, side);
  const r0 = at(-half, rise, 0);
  const r1 = at(half, rise, 0);
  // 바깥에서 볼 때 반시계 방향이 되도록 삼각형을 적는다.
  const triangles = [
    a,
    r1,
    b,
    a,
    r0,
    r1,
    d,
    c,
    r1,
    d,
    r1,
    r0,
    a,
    d,
    r0,
    b,
    r1,
    c,
  ];
  const roof = new BufferGeometry();
  roof.setAttribute(
    "position",
    new Float32BufferAttribute(triangles.flat(), 3),
  );
  roof.setAttribute(
    "uv",
    new Float32BufferAttribute(new Float32Array(triangles.length * 2), 2),
  );
  roof.computeVertexNormals();
  return paint(roof, color);
}

// 옥상 가운데 계단실·기계실 상자(아파트는 단지 띠 색, 오피스는 회색).
export function rooftopBox(frame: Frame, top: number, color: Color) {
  const height = 3;
  return orientedBox(
    [
      Math.max(3, frame.length * 0.18),
      height,
      Math.max(2.5, frame.width * 0.5),
    ],
    [frame.cx, top + height / 2, frame.cz],
    frame.angle,
    color,
  );
}

// 긴 변부터 최대 셋에 1층 간판 띠를 붙인다(변 길이의 80%, 바깥으로 0.25m 띄움).
export function signBands(
  ring: Point[],
  frame: Frame,
  base: number,
  colors: (index: number) => Color,
) {
  const edges = ring
    .map((point, index) => {
      const next = ring[(index + 1) % ring.length];
      return {
        from: point,
        dx: next[0] - point[0],
        dz: next[1] - point[1],
      };
    })
    .map((edge) => ({ ...edge, length: Math.hypot(edge.dx, edge.dz) }))
    .filter((edge) => edge.length >= 5)
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);
  return edges.map((edge, index) => {
    const mx = edge.from[0] + edge.dx / 2;
    const mz = edge.from[1] + edge.dz / 2;
    // 변의 법선 중 건물 중심에서 멀어지는 쪽을 바깥으로 본다.
    let nx = edge.dz / edge.length;
    let nz = -edge.dx / edge.length;
    if ((mx - frame.cx) * nx + (mz - frame.cz) * nz < 0) {
      nx = -nx;
      nz = -nz;
    }
    return orientedBox(
      [edge.length * 0.8, 1.1, 0.3],
      [mx + nx * 0.25, base + 3.5, mz + nz * 0.25],
      Math.atan2(edge.dz, edge.dx),
      colors(index),
    );
  });
}
