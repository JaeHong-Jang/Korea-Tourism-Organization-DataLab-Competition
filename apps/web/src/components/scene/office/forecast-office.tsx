// 판 모서리에 예보팀의 작은 사무실과 고래 봇을 놓고 상담 화면으로 연결한다.
import { Html } from "@react-three/drei";
import { useNavigate } from "react-router-dom";
import { sceneColor } from "../quality";

// 건물 전체의 클릭 영역을 키워 카메라 거리에서도 카메오를 열 수 있게 한다.
// hidden이면 그리지 않고 이름표만 숨긴다 — 동네 모드에서 Html을 떼면 React 19 DOM 제거 오류가 난다.
export function ForecastOffice({
  x,
  z,
  hidden = false,
}: {
  x: number;
  z: number;
  hidden?: boolean;
}) {
  const navigate = useNavigate();
  return (
    <group position={[x, 0, z]} visible={!hidden}>
      <mesh position={[0, 5, 0]}>
        <boxGeometry args={[22, 10, 17]} />
        <meshStandardMaterial color={sceneColor("model-canvas")} />
      </mesh>
      <mesh position={[0, 11, 0]} rotation={[0, 0, -0.15]}>
        <boxGeometry args={[25, 3, 20]} />
        <meshStandardMaterial color={sceneColor("model-stage")} />
      </mesh>
      <mesh position={[0, 6, 8.7]}>
        <planeGeometry args={[11, 5]} />
        <meshBasicMaterial color={sceneColor("window-glow")} />
      </mesh>
      {[-5, 0, 5].map((offset) => (
        <group key={offset} position={[offset, 2, 14]}>
          <mesh>
            <sphereGeometry args={[2, 6, 4]} />
            <meshStandardMaterial color={sceneColor("sea")} />
          </mesh>
          <mesh position={[0, 0.6, -1.5]}>
            <coneGeometry args={[1.4, 2, 3]} />
            <meshStandardMaterial color={sceneColor("sea")} />
          </mesh>
        </group>
      ))}
      <Html
        position={[0, 19, 0]}
        center
        style={{ display: hidden ? "none" : undefined }}
      >
        <button
          className="scene-office-link"
          type="button"
          onClick={() => navigate("/consult")}
        >
          예보팀 사무실
        </button>
      </Html>
    </group>
  );
}
