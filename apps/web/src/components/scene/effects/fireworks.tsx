// 불꽃 유형의 밤 장면에 작은 결정적 입자 폭발을 그린다.
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  IcosahedronGeometry,
  type InstancedMesh,
  MeshBasicMaterial,
  Object3D,
} from "three";
import { type SceneQuality, sceneColor } from "../quality";

// 정지 모드에는 한 순간의 폭발을 남기고 낮음 품질에서는 그리지 않는다.
export function Fireworks({
  position,
  quality,
  reducedMotion,
}: {
  position: [number, number, number];
  quality: SceneQuality;
  reducedMotion: boolean;
}) {
  const count = quality === "high" ? 48 : quality === "medium" ? 24 : 0;
  const mesh = useRef<InstancedMesh>(null);
  const object = useMemo(() => new Object3D(), []);
  const geometry = useMemo(() => new IcosahedronGeometry(1, 0), []);
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: sceneColor("window-glow"),
        transparent: true,
        opacity: 0.85,
      }),
    [],
  );

  // 일정한 방향과 반경을 재사용해 폭발이 반복되어도 입자 수가 늘지 않는다.
  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const time = reducedMotion ? 0.5 : clock.elapsedTime;
    for (let index = 0; index < count; index++) {
      const angle = index * 2.399963229728653;
      const cycle = (time * 0.22 + (index % 3) / 3) % 1;
      const radius = (8 + 28 * cycle) * (index % 2 ? 1 : 0.75);
      object.position.set(
        position[0] + Math.cos(angle) * radius,
        position[1] + 10 + 24 * cycle - 17 * cycle * cycle,
        position[2] + Math.sin(angle) * radius,
      );
      object.scale.setScalar(0.8 + cycle * 0.6);
      object.updateMatrix();
      mesh.current.setMatrixAt(index, object.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  return count ? (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, count]}
      frustumCulled={false}
    />
  ) : null;
}
