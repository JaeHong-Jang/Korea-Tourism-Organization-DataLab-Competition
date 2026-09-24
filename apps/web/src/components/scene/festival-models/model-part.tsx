// 행사 모형의 저폴리 기본 조각을 계약 색으로 칠한다.
import { sceneColor } from "../quality";

type PartProps = {
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
  rotation?: [number, number, number];
};

// 반복되는 블록은 각각 작은 메쉬로 두고 R3F가 해제하도록 맡긴다.
export function Block({ position, scale, color, rotation }: PartProps) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={scale} />
      <meshStandardMaterial
        color={sceneColor(`model-${color}`)}
        roughness={0.9}
      />
    </mesh>
  );
}

// 천막 지붕과 꽃 장식은 면이 적은 원뿔로 만든다.
export function Spire({ position, scale, color, rotation }: PartProps) {
  return (
    <mesh position={position} rotation={rotation} castShadow>
      <coneGeometry args={[scale[0], scale[1], Math.round(scale[2])]} />
      <meshStandardMaterial
        color={sceneColor(`model-${color}`)}
        roughness={0.9}
      />
    </mesh>
  );
}
