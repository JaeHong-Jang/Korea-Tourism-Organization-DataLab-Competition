// 동네 3D 카메라: 왼쪽 끌기 이동·휠 버튼 회전·휠 확대, 받침 밖으로 못 나가고 멀리 빼면 전국 판으로 돌아간다.
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import { MOUSE, TOUCH, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

const START = new Vector3(900, 980, 1180);
const MAX_DISTANCE = 2300;

// 들어올 때 비스듬한 구도로 두고 카메라 범위를 미터 단위에 맞춘다.
export function CityControls({
  reducedMotion,
  onLeave,
}: {
  reducedMotion: boolean;
  onLeave: () => void;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((state) => state.camera);
  const leaving = useRef(0);

  // 동네에 들어오는 순간 카메라 위치·가까운 면을 바꾸고 전국 판으로 돌아갈 때 되돌린다.
  useLayoutEffect(() => {
    const previous = { near: camera.near, far: camera.far };
    camera.position.copy(START);
    camera.near = 2;
    camera.far = 9000;
    camera.updateProjectionMatrix();
    controls.current?.target.set(0, 0, 0);
    controls.current?.update();
    return () => {
      camera.near = previous.near;
      camera.far = previous.far;
      camera.updateProjectionMatrix();
    };
  }, [camera]);

  // 표적을 받침 안에 두고, 최대 거리 근처로 0.4초 넘게 빼면 전국 판으로 나간다.
  useFrame((_, delta) => {
    const orbit = controls.current;
    if (!orbit) return;
    const limit = 1100;
    const x = Math.max(-limit, Math.min(limit, orbit.target.x));
    const z = Math.max(-limit, Math.min(limit, orbit.target.z));
    if (x !== orbit.target.x || z !== orbit.target.z) {
      camera.position.x += x - orbit.target.x;
      camera.position.z += z - orbit.target.z;
      orbit.target.set(x, 0, z);
    }
    const far = camera.position.distanceTo(orbit.target) > MAX_DISTANCE - 40;
    leaving.current = far ? leaving.current + delta : 0;
    if (leaving.current > 0.4) {
      leaving.current = -Infinity;
      onLeave();
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault // 사람·차가 보는 곳(표적)과 거리를 읽는다
      target={[0, 0, 0]}
      minDistance={35} // 사람 얼굴·차 바퀴가 보일 만큼 가까이 갈 수 있게
      maxDistance={MAX_DISTANCE}
      minPolarAngle={0.2}
      maxPolarAngle={1.32}
      enableDamping={!reducedMotion}
      dampingFactor={0.09}
      screenSpacePanning={false}
      zoomToCursor
      mouseButtons={{
        LEFT: MOUSE.PAN,
        MIDDLE: MOUSE.ROTATE,
        RIGHT: MOUSE.ROTATE,
      }}
      touches={{ ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_ROTATE }}
    />
  );
}
