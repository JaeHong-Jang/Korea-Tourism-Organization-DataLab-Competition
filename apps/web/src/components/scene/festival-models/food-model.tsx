// 먹거리 행사에는 천막을 한 줄로 세운다.
import { Block, Spire } from "./model-part";

// 세 천막의 아래쪽을 열어 노점의 형태를 만든다.
export function FoodModel() {
  return (
    <group>
      {[-1.2, 0, 1.2].map((x) => (
        <group key={x}>
          <Block
            position={[x, 3.1, 0]}
            scale={[1.05, 0.9, 1.25]}
            color="canvas"
          />
          <Spire position={[x, 4.02, 0]} scale={[0.83, 0.95, 4]} color="roof" />
        </group>
      ))}
    </group>
  );
}
