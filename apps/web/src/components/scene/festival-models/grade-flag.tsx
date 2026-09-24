// 행사 등급을 계약 색 깃발로 모형 옆에 표시한다.
import { sceneColor } from "../quality";

// 색만으로 등급을 알 수 없으므로 이름표와 접근성 목록이 글자를 제공한다.
export function GradeFlag({ level }: { level: number }) {
  const flagColor = getComputedStyle(document.documentElement)
    .getPropertyValue(`--level-${Math.min(4, Math.max(1, level))}`)
    .trim();
  return (
    <group position={[2.35, 2.7, 0]}>
      <mesh position={[0, 1.7, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 3.4, 6]} />
        <meshStandardMaterial color={sceneColor("model-metal")} />
      </mesh>
      <mesh position={[0.55, 2.8, 0]} castShadow>
        <boxGeometry args={[1.15, 0.62, 0.12]} />
        <meshStandardMaterial color={flagColor} roughness={1} />
      </mesh>
    </group>
  );
}
