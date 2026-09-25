// 카메라를 따라가는 인스턴스 입자로 비와 눈을 장면 안에서만 그린다.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  IcosahedronGeometry,
  type InstancedMesh,
  MeshBasicMaterial,
  Object3D,
} from "three";
import { sceneColor } from "../quality";

// 결정적 위치와 시간 위상은 눈·비를 다시 열어도 같은 장면을 만든다.
export function Precipitation({
  kind,
  count,
  reducedMotion,
  span,
}: {
  kind: "rain" | "snow";
  count: number;
  reducedMotion: boolean;
  span: number;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const camera = useThree((state) => state.camera);
  const object = useMemo(() => new Object3D(), []);
  const geometry = useMemo(
    () =>
      kind === "rain"
        ? new BoxGeometry(0.2, 3, 0.2)
        : new IcosahedronGeometry(0.8, 0),
    [kind],
  );
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: sceneColor("model-canvas"),
        transparent: true,
        opacity: kind === "rain" ? 0.58 : 0.88,
        depthWrite: false,
      }),
    [kind],
  );
  const phases = useMemo(
    () =>
      Float32Array.from(
        { length: count },
        (_, index) => (index * 0.61803398875) % 1,
      ),
    [count],
  );
  const width = span;

  // 같은 Object3D를 재사용해 매 프레임 입자 행렬에 할당을 만들지 않는다.
  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const time = reducedMotion ? 0 : clock.elapsedTime;
    for (let index = 0; index < count; index++) {
      const phase = phases[index];
      const x = (((index * 0.754877666) % 1) - 0.5) * width;
      const z = (((index * 0.569840291) % 1) - 0.5) * width;
      const fall = (phase - time * (kind === "rain" ? 0.52 : 0.09)) % 1;
      object.position.set(
        camera.position.x + x,
        camera.position.y + (((fall + 1) % 1) - 0.5) * width * 0.65,
        camera.position.z + z,
      );
      object.rotation.set(0, 0, 0);
      object.scale.setScalar(1);
      object.updateMatrix();
      mesh.current.setMatrixAt(index, object.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  // 첫 프레임 전에도 정지 입자가 보이도록 행렬을 한 번 채운다.
  useLayoutEffect(() => {
    if (mesh.current) mesh.current.frustumCulled = false;
  }, []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  return <instancedMesh ref={mesh} args={[geometry, material, count]} />;
}
