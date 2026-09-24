// 기타 행사에는 유형을 임의로 추정하지 않는 작은 광장 천막을 둔다.
import { Block, Spire } from "./model-part";

// 한 채의 작은 천막을 광장 받침 위에 올린다.
export function OtherModel() {
  return (
    <group>
      <Block position={[0, 2.8, 0]} scale={[3, 0.2, 3]} color="bed" />
      <Block position={[0, 3.35, 0]} scale={[1.8, 0.9, 1.8]} color="canvas" />
      <Spire position={[0, 4.2, 0]} scale={[1.4, 0.9, 4]} color="roof" />
    </group>
  );
}
