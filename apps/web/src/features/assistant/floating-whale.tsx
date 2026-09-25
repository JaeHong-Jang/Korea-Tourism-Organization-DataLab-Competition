// 앱 위에 작은 저폴리 고래를 띄우고 정지 설정에서는 펫 그림을 쓴다.
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { Group } from "three";
import { PetAvatar } from "../../components/pets";

// 고래의 몸통·꼬리·지느러미·눈을 단순 형상으로 그린다.
function WhaleMesh() {
  const group = useRef<Group>(null);
  const colors = getComputedStyle(document.documentElement);
  const shell = colors.getPropertyValue("--team-lead").trim();
  const face = colors.getPropertyValue("--on-brand").trim();
  const eye = colors.getPropertyValue("--ink").trim();
  useFrame((state) => {
    if (group.current) {
      group.current.position.y = Math.sin(state.clock.elapsedTime * 1.2) * 0.12;
      group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.6) * 0.15;
    }
  });
  return (
    <group ref={group} rotation={[0, -0.2, 0]}>
      <mesh scale={[1.45, 0.86, 0.95]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshBasicMaterial color={shell} />
      </mesh>
      <mesh position={[0.25, -0.32, 0.62]} scale={[0.94, 0.42, 0.48]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshBasicMaterial color={face} />
      </mesh>
      <mesh position={[-1.55, 0.2, 0]} rotation={[0, 0, -0.5]}>
        <coneGeometry args={[0.7, 1.25, 4]} />
        <meshBasicMaterial color={shell} />
      </mesh>
      <mesh position={[0.35, 0.73, 0]} rotation={[0, 0, -0.2]}>
        <coneGeometry args={[0.35, 0.7, 4]} />
        <meshBasicMaterial color={shell} />
      </mesh>
      <mesh position={[-0.3, 0.12, 0.91]}>
        <sphereGeometry args={[0.12, 6, 4]} />
        <meshBasicMaterial color={eye} />
      </mesh>
    </group>
  );
}

// 탭과 화면에서 보이지 않을 때 캔버스 프레임을 멈춘다.
export function FloatingWhale({
  working,
  published,
  onClick,
}: {
  working: boolean;
  published: boolean;
  onClick: () => void;
}) {
  const target = useRef<HTMLButtonElement>(null);
  const [inView, setInView] = useState(true);
  const [tabVisible, setTabVisible] = useState(() => !document.hidden);
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const update = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    const observer = new IntersectionObserver((entries) =>
      setInView(entries[0]?.isIntersecting ?? false),
    );
    if (target.current) observer.observe(target.current);
    return () => {
      document.removeEventListener("visibilitychange", update);
      observer.disconnect();
    };
  }, []);
  return (
    <button
      ref={target}
      type="button"
      className="assistant-whale"
      aria-label="고래 봇 대화 열기"
      onClick={onClick}
    >
      <span className="assistant-whale__figure">
        {reduced ? (
          <PetAvatar
            agentId="lead"
            state={working ? "working" : published ? "done" : "idle"}
            size={96}
          />
        ) : (
          <Canvas
            aria-hidden="true"
            dpr={1}
            frameloop={inView && tabVisible ? "always" : "never"}
            camera={{ position: [0, 0, 5], fov: 42 }}
          >
            <WhaleMesh />
          </Canvas>
        )}
      </span>
      {(working || published) && (
        <span className="assistant-whale__status">
          {working ? "작업 중" : "발행됨"}
        </span>
      )}
    </button>
  );
}
