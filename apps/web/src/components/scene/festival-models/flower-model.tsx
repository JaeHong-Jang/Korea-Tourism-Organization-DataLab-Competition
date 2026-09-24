// 꽃 행사에는 둥근 화단과 낮은 꽃 조각을 놓는다.
import { Block, Spire } from "./model-part";

// 화단 가장자리를 드러내고 꽃을 격자로 심는다.
export function FlowerModel() {
  return (
    <group>
      <Block position={[0, 2.85, 0]} scale={[3.7, 0.3, 3.2]} color="bed" />
      {[-1, 0, 1].flatMap((x) =>
        [-0.8, 0.8].map((z) => (
          <Spire
            key={`${x}-${z}`}
            position={[x, 3.25, z]}
            scale={[0.35, 0.6, 6]}
            color="bloom"
          />
        )),
      )}
    </group>
  );
}
