// 사각 받침판 없이 대한민국 지형 아래로 넓은 바다만 펼친다.
import { sceneColor } from "./quality";

export function Board({
  center,
  width,
  depth,
}: {
  center: [number, number];
  width: number;
  depth: number;
}) {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[center[0], 5.5, center[1]]}
      receiveShadow
    >
      <planeGeometry
        args={[Math.max(30000, width * 40), Math.max(30000, depth * 40)]}
      />
      <meshStandardMaterial color={sceneColor("sea")} roughness={1} />
    </mesh>
  );
}
