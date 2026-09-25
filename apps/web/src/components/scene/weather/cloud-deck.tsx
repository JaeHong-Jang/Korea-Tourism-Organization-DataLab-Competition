// 흐린 하늘에는 장면 높이에만 얇은 반투명 구름 판을 올린다.
import { sceneColor } from "../quality";

// 판 크기에 따라 구름을 배치해 화면 글자 레이어에 영향을 주지 않는다.
export function CloudDeck({
  center,
  span,
}: {
  center: [number, number];
  span: number;
}) {
  return (
    <group position={[center[0], span * 0.17, center[1]]}>
      {[-0.32, 0.06, 0.37].map((offset) => (
        <mesh
          key={offset}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[offset * span, offset * 30, offset * span * 0.35]}
        >
          <planeGeometry args={[span * 0.42, span * 0.18]} />
          <meshBasicMaterial
            color={sceneColor("model-canvas")}
            transparent
            opacity={0.22}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}
