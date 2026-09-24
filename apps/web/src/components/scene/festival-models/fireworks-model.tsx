// 불꽃 행사에는 발사대와 기울어진 발사관을 세운다.
import { Block } from "./model-part";

// 작은 금속 발사관을 받침대 위에 나란히 배치한다.
export function FireworksModel() {
  return (
    <group>
      <Block position={[0, 2.9, 0]} scale={[3.5, 0.3, 2.6]} color="stage" />
      {[-0.85, 0, 0.85].map((x) => (
        <Block
          key={x}
          position={[x, 3.7, 0]}
          scale={[0.34, 1.5, 0.34]}
          rotation={[0, 0, x * 0.15]}
          color="metal"
        />
      ))}
    </group>
  );
}
