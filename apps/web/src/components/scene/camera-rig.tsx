// 전국 판을 비스듬히 보고 키보드와 선택 시군구로 카메라를 옮긴다.
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { overviewPose } from "./camera-framing";
import { observePanelBounds, type PanelBounds } from "./scene-panel-bounds";

type CameraRigProps = {
  center: [number, number];
  selected: [number, number] | null;
  reducedMotion: boolean;
  focus?: boolean;
  width: number;
  depth: number;
  overviewRevision: number;
};

// 장면 컨테이너의 직접 포커스만 카메라 조작으로 인정한다.
export function isSceneCameraKey(
  event: KeyboardEvent,
  stage: HTMLElement,
): boolean {
  const target = event.target;
  return (
    !event.defaultPrevented &&
    document.activeElement === stage &&
    target instanceof Element &&
    (target === stage || target instanceof HTMLCanvasElement)
  );
}

// 포인터 궤도는 고정 범위로 묶고 키보드 이동을 같은 표적으로 모은다.
export function CameraRig({
  center,
  selected,
  reducedMotion,
  focus = false,
  width,
  depth,
  overviewRevision,
}: CameraRigProps) {
  const controls = useRef<OrbitControlsImpl>(null);
  const desired = useRef(new Vector3(center[0], 0, center[1] + 90));
  const desiredPosition = useRef(
    new Vector3(center[0] + 430, 590, center[1] + 810),
  );
  const moving = useRef(false);
  const { camera, gl } = useThree();
  const [bounds, setBounds] = useState<PanelBounds | null>(null);
  const stage = useRef<HTMLElement | null>(null);

  // 이름표와 같은 패널 경계 캐시를 구독해 접힘과 화면 크기 변화를 반영한다.
  useLayoutEffect(() => {
    const container = gl.domElement.closest(".scene-stage");
    if (!(container instanceof HTMLElement)) return;
    stage.current = container;
    return observePanelBounds(container, setBounds);
  }, [gl.domElement]);

  // 선택 지점으로 카메라와 표적을 함께 옮겨 시선 각도를 보존한다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: 전국 보기 버튼은 선택이 비어 있어도 구도를 다시 적용한다.
  useEffect(() => {
    const overview =
      bounds && bounds.width > 0 && bounds.height > 0
        ? overviewPose(bounds, center, width, depth, 44)
        : null;
    const point = selected ?? [center[0], center[1] + 90];
    const close = Boolean(selected && focus);
    if (!selected && overview) {
      desired.current.copy(overview.target);
      desiredPosition.current.copy(overview.position);
    } else {
      desired.current.set(point[0], 0, point[1]);
      desiredPosition.current.set(
        point[0] + (close ? 75 : 430),
        close ? 105 : 590,
        point[1] + (close ? 155 : 720),
      );
    }
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
  }, [
    selected,
    reducedMotion,
    focus,
    camera,
    center[0],
    center[1],
    bounds,
    width,
    depth,
    overviewRevision,
  ]);

  // E2E 진단에서만 실제 OrbitControls 표적을 읽을 수 있게 한다.
  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get("sceneDiagnostic") !== "1"
    )
      return;
    window.__crowdcastCameraTarget = () => {
      const point = controls.current?.target;
      return point ? [point.x, point.y, point.z] : null;
    };
    window.__crowdcastBoardCorners = () => {
      camera.updateMatrixWorld();
      return [
        [center[0] - width / 2, center[1] - depth / 2],
        [center[0] + width / 2, center[1] - depth / 2],
        [center[0] - width / 2, center[1] + depth / 2],
        [center[0] + width / 2, center[1] + depth / 2],
      ].map(([x, z]) => {
        const point = new Vector3(x, 8, z).project(camera);
        const canvas = gl.domElement.getBoundingClientRect();
        return [
          canvas.left + ((point.x + 1) * canvas.width) / 2,
          canvas.top + ((1 - point.y) * canvas.height) / 2,
        ];
      });
    };
    return () => {
      delete window.__crowdcastCameraTarget;
      delete window.__crowdcastBoardCorners;
    };
  }, [camera, center, width, depth, gl.domElement]);

  // 방향키는 판 위를 이동하고 +/-는 현재 표적을 향해 확대한다.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const orbit = controls.current;
      if (!orbit || !stage.current || !isSceneCameraKey(event, stage.current))
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
      maxDistance={4000}
      enableDamping={!reducedMotion}
      dampingFactor={0.09}
      enablePan
    />
  );
}

declare global {
  interface Window {
    __crowdcastCameraTarget?: () => [number, number, number] | null;
    __crowdcastBoardCorners?: () => number[][];
  }
}
