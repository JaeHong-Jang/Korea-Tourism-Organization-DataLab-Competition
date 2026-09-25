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
  const desired = useRef(new Vector3(center[0], 0, center[1] + 90));
  const desiredPosition = useRef(
    new Vector3(center[0] + 430, 590, center[1] + 810),
  );
  const moving = useRef(false);
  const { camera } = useThree();

  // 선택 지점으로 카메라와 표적을 함께 옮겨 시선 각도를 보존한다.
  useEffect(() => {
    const point = selected ?? [center[0], center[1] + 90];
    const close = Boolean(selected && focus);
    desired.current.set(point[0], 0, point[1]);
    desiredPosition.current.set(
      point[0] + (close ? 75 : 430),
      close ? 105 : 590,
      point[1] + (close ? 155 : 720),
    );
    if (reducedMotion) {
      if (controls.current) {
        controls.current.target.copy(desired.current);
        camera.position.copy(desiredPosition.current);
        controls.current.update();
      }
      moving.current = false;
      return;
    }
    moving.current = true;
  }, [selected, reducedMotion, focus, camera, center[0], center[1]]);

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
        desiredPosition.current.copy(camera.position);
        moving.current = false;
      } else if (event.key === "+" || event.key === "=" || event.key === "-") {
        event.preventDefault();
        const factor = event.key === "-" ? 1.12 : 0.89;
        camera.position
          .sub(orbit.target)
          .multiplyScalar(factor)
          .add(orbit.target);
        desiredPosition.current.copy(camera.position);
        moving.current = false;
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
    const step = Math.min(1, delta * 4);
    orbit.target.lerp(desired.current, step);
    camera.position.lerp(desiredPosition.current, step);
    orbit.update();
    if (
      orbit.target.distanceToSquared(desired.current) < 0.01 &&
      camera.position.distanceToSquared(desiredPosition.current) < 0.01
    )
      moving.current = false;
  });

  return (
    <OrbitControls
      ref={controls}
      target={[center[0], 0, center[1] + 90]}
      minPolarAngle={0.35}
      maxPolarAngle={1.25}
      minDistance={50}
      maxDistance={1800}
      enableDamping={!reducedMotion}
      dampingFactor={0.09}
      enablePan
    />
  );
}
