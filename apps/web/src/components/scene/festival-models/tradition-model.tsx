// 전통 행사에는 한옥 지붕을 닮은 박공 천막을 세운다.
import { Block } from "./model-part";

// 지붕 양쪽을 경사지게 놓고 밝은 천막을 아래에 둔다.
export function TraditionModel() {
  return (
    <group>
      <Block position={[0, 3.25, 0]} scale={[3.2, 1.1, 2.4]} color="canvas" />
      <Block
        position={[-0.85, 4.1, 0]}
        scale={[2.15, 0.28, 2.9]}
        rotation={[0, 0, 0.48]}
        color="roof"
      />
      <Block
        position={[0.85, 4.1, 0]}
        scale={[2.15, 0.28, 2.9]}
        rotation={[0, 0, -0.48]}
        color="roof"
      />
    </group>
  );
}
