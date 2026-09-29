// 성남 프로젝트와 같은 직교 카메라와 지도식 이동·회전·커서 확대를 제공한다.
import { MapControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef } from "react";
import { MOUSE, type OrthographicCamera, Vector3 } from "three";
import type { OrbitControls } from "three-stdlib";

export function RegionalControls({
  onMove,
  command,
}: {
  onMove: (x: number, z: number) => void;
  command: { id: number; type: string };
}) {
  const { camera, size, gl } = useThree();
  const ref = useRef<OrbitControls>(null);
  const baseZoom = size.height / 360;
  useLayoutEffect(() => {
    camera.position.set(1100, 1500, 1350);
    camera.zoom = baseZoom;
    camera.updateProjectionMatrix();
    ref.current?.target.set(0, 0, 0);
    ref.current?.update();
  }, [camera, baseZoom]);
  useEffect(() => {
    if (!command.id || !ref.current) return;
    const controls = ref.current;
    if (command.type === "top")
      camera.position.copy(controls.target).add(new Vector3(0, 3200, 1));
    else if (command.type === "reset") {
      controls.target.set(0, 0, 0);
      camera.position.set(1100, 1500, 1350);
      camera.zoom = baseZoom;
    } else
      camera.zoom = Math.max(
        size.height / 2300,
        Math.min(
          size.height / 90,
          camera.zoom * (command.type === "in" ? 1.3 : 1 / 1.3),
        ),
      );
    camera.updateProjectionMatrix();
    controls.update();
  }, [command, camera, size.height, baseZoom]);
  useEffect(() => {
    gl.domElement.dataset.projection = "orthographic";
    return () => {
      delete gl.domElement.dataset.projection;
    };
  }, [gl]);
  return (
    <MapControls
      ref={ref}
      makeDefault
      enableDamping={false}
      zoomToCursor
      minZoom={size.height / 2300}
      maxZoom={size.height / 90}
      minPolarAngle={0.02}
      maxPolarAngle={Math.PI / 2.6}
      zoomSpeed={0.7}
      rotateSpeed={0.55}
      mouseButtons={{
        LEFT: MOUSE.PAN,
        MIDDLE: MOUSE.ROTATE,
        RIGHT: MOUSE.ROTATE,
      }}
      onEnd={() => {
        const target = ref.current?.target;
        if (target) onMove(target.x, target.z);
        (camera as OrthographicCamera).updateProjectionMatrix();
      }}
    />
  );
}
