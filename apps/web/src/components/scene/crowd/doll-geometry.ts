// 원통 머리와 사각 몸통·두 다리로 자체 블록 인형 형상을 만든다.
import {
  BoxGeometry,
  type BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  PlaneGeometry,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// 가까운 인형의 사각 몸통과 십자 단면 다리를 한 형상으로 합친다.
export function dollBodyGeometry(): BufferGeometry {
  const pieces = [
    new BoxGeometry(0.42, 0.75, 0.27).translate(0, 0.98, 0),
    ...[-0.13, 0.13].flatMap((x) => [
      new PlaneGeometry(0.15, 0.53).translate(x, 0.34, 0),
      new PlaneGeometry(0.2, 0.53).rotateY(Math.PI / 2).translate(x, 0.34, 0),
    ]),
  ];
  const geometry = mergeGeometries(pieces, false);
  pieces.forEach((piece) => {
    piece.dispose();
  });
  if (!geometry) throw new Error("인형 몸통 형상을 합칠 수 없습니다.");
  return geometry;
}

// 머리 윗면을 덮은 육각 원통을 피부색 인스턴스로 그린다.
export function dollHeadGeometry(): BufferGeometry {
  const pieces = [
    new CylinderGeometry(0.24, 0.24, 0.38, 6, 1, true).translate(0, 1.56, 0),
    new CircleGeometry(0.24, 6)
      .rotateX(-Math.PI / 2)
      .rotateY(Math.PI / 6)
      .translate(0, 1.75, 0),
  ];
  const geometry = mergeGeometries(pieces, false);
  pieces.forEach((piece) => {
    piece.dispose();
  });
  if (!geometry) throw new Error("인형 머리 형상을 합칠 수 없습니다.");
  return geometry;
}

// 멀리서는 한 픽셀 규모라 다리를 몸통에 합친 사각과 머리 사각을 직각으로 교차시키고 윗면 하나를 덧대(삼각형 10개) 어느 시선에서도 보이게 한다.
export function dollFarGeometry(): BufferGeometry {
  const silhouette = () => [
    new PlaneGeometry(0.42, 1.28).translate(0, 0.71, 0),
    new PlaneGeometry(0.48, 0.38).translate(0, 1.56, 0),
  ];
  const pieces = [
    ...silhouette(),
    ...silhouette().map((piece) => piece.rotateY(Math.PI / 2)),
    new PlaneGeometry(0.42, 0.42).rotateX(-Math.PI / 2).translate(0, 1.75, 0),
  ];
  const geometry = mergeGeometries(pieces, false);
  pieces.forEach((piece) => {
    piece.dispose();
  });
  if (!geometry) throw new Error("먼 인형 형상을 합칠 수 없습니다.");
  return geometry;
}
