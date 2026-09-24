// 전국 판을 비스듬히 보고 키보드와 선택 시군구로 카메라를 옮긴다.
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

type CameraRigProps = {
  center: [number, number];
  selected: [number, number] | null;
  reducedMotion: boolean;
  focus?: boolean;
};

// 포인터 궤도는 고정 범위로 묶고 키보드 이동을 같은 표적으로 모은다.
export function CameraRig({
  center,
  selected,
  reducedMotion,
  focus = false,
}: CameraRigProps) {
  const controls = useRef<OrbitControlsImpl>(null);
  const desired = useRef(new Vector3(center[0], 0, center[1]));
  const previous = useRef(new Vector3());
  const moving = useRef(false);
  const { camera } = useThree();

  // 선택 지점으로 카메라와 표적을 함께 옮겨 시선 각도를 보존한다.
  useEffect(() => {
    if (reducedMotion) {
      moving.current = false;
      return;
    }
    if (!selected || !controls.current) return;
    if (focus) {
      controls.current.target.set(selected[0], 0, selected[1]);
      camera.position.set(selected[0] + 25, 45, selected[1] + 60);
      controls.current.update();
      moving.current = false;
      return;
    }
    desired.current.set(selected[0], 0, selected[1]);
    moving.current = true;
  }, [selected, reducedMotion, focus, camera]);

  // 방향키는 판 위를 이동하고 +/-는 현재 표적을 향해 확대한다.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const orbit = controls.current;
      if (
        !orbit ||
        /INPUT|TEXTAREA|SELECT/.test(
          (event.target as HTMLElement)?.tagName ?? "",
        )
      )
        return;
      const movement: Record<string, [number, number]> = {
        ArrowLeft: [-20, 0],
        ArrowRight: [20, 0],
        ArrowUp: [0, -20],
        ArrowDown: [0, 20],
      };
      const step = movement[event.key];
      if (step) {
        event.preventDefault();
        orbit.target.x += step[0];
        orbit.target.z += step[1];
        camera.position.x += step[0];
        camera.position.z += step[1];
        desired.current.copy(orbit.target);
      } else if (event.key === "+" || event.key === "=" || event.key === "-") {
        event.preventDefault();
        const factor = event.key === "-" ? 1.12 : 0.89;
        camera.position
          .sub(orbit.target)
          .multiplyScalar(factor)
          .add(orbit.target);
      } else return;
      orbit.update();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [camera]);

  // 자동 이동은 매 프레임 기존 벡터를 재사용해 부드럽게 끝낸다.
  useFrame((_, delta) => {
    const orbit = controls.current;
    if (!orbit || reducedMotion || !moving.current) return;
    previous.current.copy(orbit.target);
    orbit.target.lerp(desired.current, Math.min(1, delta * 4));
    camera.position.add(orbit.target).sub(previous.current);
    orbit.update();
    if (orbit.target.distanceToSquared(desired.current) < 0.01)
      moving.current = false;
  });

  return (
    <OrbitControls
      ref={controls}
      target={[center[0], 0, center[1]]}
      minPolarAngle={0.35}
      maxPolarAngle={1.25}
      minDistance={focus ? 50 : 350}
      maxDistance={1800}
      enableDamping={!reducedMotion}
      dampingFactor={0.09}
      enablePan
    />
  );
}
