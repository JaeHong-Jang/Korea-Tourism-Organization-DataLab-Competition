// 공연 행사에는 무대와 양쪽 조명탑을 놓는다.
import { Block } from "./model-part";

// 무대 지붕과 조명탑의 높이를 달리해 멀리서도 구별한다.
export function PerformanceModel() {
  return (
    <group>
      <Block position={[0, 2.9, 0]} scale={[3.6, 0.35, 2.2]} color="stage" />
      <Block position={[0, 4.4, -0.9]} scale={[3.6, 0.2, 0.5]} color="roof" />
      {[-2, 2].map((x) => (
        <group key={x}>
          <Block
            position={[x, 4.1, 0]}
            scale={[0.18, 2.5, 0.18]}
            color="metal"
          />
          <Block
            position={[x, 5.2, 0.3]}
            scale={[0.6, 0.35, 0.4]}
            color="canvas"
          />
        </group>
      ))}
    </group>
  );
}
