// 전국 지형 아래 둥근 나무판과 무광 바다를 놓는다.
import { useEffect, useMemo } from "react";
import { ExtrudeGeometry, Shape, ShapeGeometry } from "three";
import { sceneColor } from "./quality";

type BoardProps = { center: [number, number]; width: number; depth: number };

// 판의 바깥 윤곽을 실제 곡선으로 만들어 모서리를 부드럽게 한다.
function roundedBoard(width: number, depth: number, radius: number): Shape {
  const x = -width / 2;
  const y = -depth / 2;
  const shape = new Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + depth - radius);
  shape.quadraticCurveTo(x + width, y + depth, x + width - radius, y + depth);
  shape.lineTo(x + radius, y + depth);
  shape.quadraticCurveTo(x, y + depth, x, y + depth - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

// 돌출 판과 그 위의 바다를 한 위치 기준으로 배치한다.
export function Board({ center, width, depth }: BoardProps) {
  const geometry = useMemo(
    () =>
      new ExtrudeGeometry(roundedBoard(width, depth, 22), {
        depth: 18,
        bevelEnabled: true,
        bevelSize: 3,
        bevelThickness: 3,
        bevelSegments: 2,
        curveSegments: 5,
      }),
    [width, depth],
  );
  const seaGeometry = useMemo(
    () => new ShapeGeometry(roundedBoard(width - 12, depth - 12, 16), 5),
    [width, depth],
  );

  // 판과 바다의 형상 버퍼를 크기 변경이나 장면 해제 때 정리한다.
  useEffect(
    () => () => {
      geometry.dispose();
      seaGeometry.dispose();
    },
    [geometry, seaGeometry],
  );

  return (
    <group position={[center[0], 0, center[1]]}>
      <mesh
        geometry={geometry}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -17, 0]}
      >
        <meshStandardMaterial
          attach="material-0"
          color={sceneColor("board-top")}
          roughness={1}
        />
        <meshStandardMaterial
          attach="material-1"
          color={sceneColor("board-side")}
          roughness={1}
        />
      </mesh>
      <mesh
        geometry={seaGeometry}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 5.5, 0]}
        receiveShadow
      >
        <meshStandardMaterial color={sceneColor("sea")} roughness={1} />
      </mesh>
    </group>
  );
}
