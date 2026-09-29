// 축제 시설의 작은 소품까지 하나의 정적 메시로 합쳐 드로 콜을 줄인다.
import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  ConeGeometry,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { FestivalProp } from "./festival-layout";

const COLORS = ["#da785c", "#e5b13d", "#428f82", "#648daf", "#9873a7"];

// 모든 소품을 실제 배치 좌표로 굽고 색상은 정점에 저장한다.
export function festivalDecorationGeometry(props: FestivalProp[]) {
  const parts: BufferGeometry[] = [];
  let ground = 0;
  const add = (
    geometry: BufferGeometry,
    x: number,
    y: number,
    z: number,
    color: string,
    rotation = 0,
  ) => {
    const part = geometry.toNonIndexed();
    geometry.dispose();
    part.applyMatrix4(
      new Matrix4().compose(
        new Vector3(x, y + ground, z),
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), rotation),
        new Vector3(1, 1, 1),
      ),
    );
    part.deleteAttribute("uv");
    const paint = new Color(color);
    const colors = new Float32Array(part.getAttribute("position").count * 3);
    for (let i = 0; i < colors.length; i += 3) paint.toArray(colors, i);
    part.setAttribute("color", new Float32BufferAttribute(colors, 3));
    parts.push(part);
  };
  props.forEach((p, index) => {
    ground = p.y ?? 0;
    const box = (
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      color: string,
    ) => add(new BoxGeometry(w, h, d), p.x + x, y, p.z + z, color);
    const color = COLORS[index % COLORS.length];
    if (p.stage) {
      box(0, 0.8, 0, 28, 1.6, 18, "#6a566e");
      box(0, 7, -8, 28, 12, 0.7, "#384f66");
      box(0, 7, -7.5, 19, 8, 0.25, "#df9a61");
      for (const x of [-13, 13]) {
        box(x, 8, 0, 0.7, 16, 0.7, "#555963");
        box(x, 4, 6, 3, 7, 3, "#333945");
      }
      box(0, 16, 0, 27, 0.8, 0.8, "#555963");
      for (const x of [-10, -5, 0, 5, 10]) {
        box(x, 15.3, 0, 1.2, 1.2, 1.2, COLORS[(x + 10) / 5]);
      }
      for (const x of [-6, 0, 6]) {
        box(x, 3.2, 2, 0.9, 2.8, 0.6, "#364659");
        box(x, 5, 2, 1, 1.5, 0.6, COLORS[(x + 6) / 6]);
        add(new SphereGeometry(0.48, 6, 4), p.x + x, 6.2, p.z + 2, "#e9c6a7");
        box(x + 1.1, 3.6, 3, 0.15, 4, 0.15, "#343641");
      }
    } else if (p.kind === "gate") {
      for (const x of [-9, 9]) box(x, 6, 0, 1.5, 12, 2, color);
      box(0, 12, 0, 20, 3, 2, "#e9b855");
      for (const x of [-6, -3, 0, 3, 6])
        box(x, 12, 1.1, 1.4, 1.4, 0.2, COLORS[(x + 6) / 3]);
    } else if (p.kind === "lounge") {
      box(0, 1.9, 0, 7, 0.5, 4, "#bb9569");
      for (const z of [-3.5, 3.5]) box(0, 1, z, 8, 0.5, 1.1, "#bb9569");
      box(0, 4, 0, 0.25, 8, 0.25, "#786955");
      add(new ConeGeometry(6, 2.5, 8), p.x, 8, p.z, color);
    } else if (p.kind === "garden") {
      box(0, 0.4, 0, 11, 0.8, 9, "#719664");
      for (const x of [-3, 0, 3])
        for (const z of [-2, 2]) {
          box(x, 1.5, z, 0.15, 2, 0.15, "#467f4e");
          add(
            new SphereGeometry(0.9, 5, 3),
            p.x + x,
            2.6,
            p.z + z,
            COLORS[(index + Math.abs(x)) % 5],
          );
        }
    } else {
      box(0, 0.25, 0, 12, 0.5, 10, "#d5c19d");
      add(new ConeGeometry(7.8, 3.5, 4), p.x, 8, p.z, color, Math.PI / 4);
      for (const x of [-5, 5])
        for (const z of [-4, 4]) box(x, 3.5, z, 0.3, 7, 0.3, "#f4e8cc");
      box(0, 2.4, 3, 10, 3, 2, "#f1dcb8");
      for (const x of [-3, 0, 3]) {
        box(x, 4.2, 3, 1.7, 0.7, 1.2, COLORS[(index + Math.abs(x)) % 5]);
      }
      box(0, 5.8, 4, 8, 1.1, 0.25, color);
      if (p.kind === "info") {
        box(0, 6.5, 4.2, 2.6, 3.6, 0.2, "#3975a2");
        box(0, 6.2, 4.4, 0.4, 1.3, 0.2, "#fff6df");
        box(0, 7.3, 4.4, 0.4, 0.4, 0.2, "#fff6df");
      }
      for (const x of [-5, 5]) box(x, 5.3, -4, 0.2, 10.6, 0.2, "#8b765a");
      box(0, 10.5, -4, 10, 0.12, 0.12, "#8b765a");
      for (const x of [-4, -2, 0, 2, 4])
        add(
          new ConeGeometry(0.65, 1.4, 3),
          p.x + x,
          9.7,
          p.z - 4,
          COLORS[(x + 4) / 2],
        );
    }
  });
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => {
    part.dispose();
  });
  return merged;
}
