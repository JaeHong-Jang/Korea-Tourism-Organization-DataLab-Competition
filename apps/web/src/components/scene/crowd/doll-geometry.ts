// 원통 머리와 사각 몸통·두 다리로 자체 블록 인형 형상을 만든다.
import { BoxGeometry, type BufferGeometry, CylinderGeometry } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// 옷과 다리를 한 형상으로 합쳐 한 번의 인스턴싱 호출에 담는다.
export function dollBodyGeometry(): BufferGeometry {
  const pieces = [
    new BoxGeometry(0.42, 0.75, 0.27).translate(0, 0.98, 0),
    new BoxGeometry(0.15, 0.53, 0.2).translate(-0.13, 0.34, 0),
    new BoxGeometry(0.15, 0.53, 0.2).translate(0.13, 0.34, 0),
  ];
  const geometry = mergeGeometries(pieces, false);
  pieces.forEach((piece) => {
    piece.dispose();
  });
  if (!geometry) throw new Error("인형 몸통 형상을 합칠 수 없습니다.");
  return geometry;
}

// 둥근 머리를 몸통과 따로 인스턴싱해 피부색을 고정한다.
export function dollHeadGeometry(): BufferGeometry {
  return new CylinderGeometry(0.24, 0.24, 0.38, 8).translate(0, 1.56, 0);
}
