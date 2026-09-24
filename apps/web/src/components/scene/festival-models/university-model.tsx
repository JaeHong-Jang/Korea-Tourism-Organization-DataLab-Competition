// 대학 행사에는 낮은 무대와 가로 현수막을 세운다.
import { Block } from "./model-part";

// 현수막을 무대 위 두 기둥에 걸어 공연 모형과 구별한다.
export function UniversityModel() {
  return (
    <group>
      <Block position={[0, 2.9, 0]} scale={[3.5, 0.3, 2.4]} color="stage" />
      {[-1.65, 1.65].map((x) => (
        <Block
          key={x}
          position={[x, 4.15, -0.6]}
          scale={[0.14, 2.3, 0.14]}
          color="metal"
        />
      ))}
      <Block
        position={[0, 4.8, -0.6]}
        scale={[3.3, 0.7, 0.12]}
        color="banner"
      />
    </group>
  );
}
