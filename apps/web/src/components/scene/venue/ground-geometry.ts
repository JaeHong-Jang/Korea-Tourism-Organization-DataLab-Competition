// 타일의 도로·선로를 폭 있는 띠로, 물·공원을 납작한 면으로 만드는 지면 형상 도우미(동네 3D가 쓴다).
import { BufferAttribute, BufferGeometry, Shape, ShapeGeometry } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clipPolygon, clipSegment } from "./clip";
import type { Point } from "./coordinates";
import type { VenueArea, VenueLine } from "./tiles";

// 각 도로 선분을 폭을 가진 사각형으로 만들고 한 버퍼에 담는다.
export function stripGeometry(lines: VenueLine[], y: number): BufferGeometry {
  const positions: number[] = [];
  for (const { from, to, width } of lines) {
    const limit = 1200 - width / 2;
    const bounded = clipSegment(
      [from[0] + limit, from[1] + limit],
      [to[0] + limit, to[1] + limit],
      limit * 2,
    );
    if (!bounded) continue;
    const start: Point = [bounded[0][0] - limit, bounded[0][1] - limit];
    const end: Point = [bounded[1][0] - limit, bounded[1][1] - limit];
    const dx = end[0] - start[0],
      dz = end[1] - start[1];
    const length = Math.hypot(dx, dz);
    if (length < 0.1) continue;
    const ox = ((-dz / length) * width) / 2,
      oz = ((dx / length) * width) / 2;
    const a = [start[0] + ox, y, start[1] + oz],
      b = [start[0] - ox, y, start[1] - oz];
    const c = [end[0] + ox, y, end[1] + oz],
      d = [end[0] - ox, y, end[1] - oz];
    positions.push(...a, ...b, ...c, ...b, ...d, ...c);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}

// 작은 다각형들을 같은 재료 한 메시로 합쳐 그리기 호출 수를 제한한다.
export function areaGeometry(
  areas: VenueArea[],
  kind: VenueArea["kind"],
): BufferGeometry | null {
  const pieces: BufferGeometry[] = [];
  for (const area of areas) {
    if (area.kind !== kind || area.points.length < 3) continue;
    const bounded = clipPolygon(
      area.points.map(([x, z]) => [x + 1200, z + 1200]),
      2400,
    ).map(([x, z]) => [x - 1200, z - 1200] as Point);
    if (bounded.length < 3) continue;
    const shape = new Shape();
    bounded.forEach(([x, z], index) => {
      if (index === 0) shape.moveTo(x, -z);
      else shape.lineTo(x, -z);
    });
    shape.closePath();
    const geometry = new ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, kind === "water" ? 0.7 : 0.4, 0);
    pieces.push(geometry);
  }
  const merged = pieces.length ? mergeGeometries(pieces, false) : null;
  pieces.forEach((piece) => {
    piece.dispose();
  });
  return merged;
}
