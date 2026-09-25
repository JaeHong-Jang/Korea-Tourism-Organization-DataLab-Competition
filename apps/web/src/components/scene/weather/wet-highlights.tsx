// 높은 품질의 비 장면에 가로등 아래 젖은 바닥의 길쭉한 반사광을 더한다.
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  type InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
} from "three";
import { sceneColor } from "../quality";

// 실제 반사 패스 없이 같은 조명색 조각을 묶어 프레임 비용을 제한한다.
export function WetHighlights({
  center,
  y,
  radius,
  count = 12,
}: {
  center: [number, number];
  y: number;
  radius: number;
  count?: number;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const object = useMemo(() => new Object3D(), []);
  const geometry = useMemo(() => new PlaneGeometry(1, 1), []);
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: sceneColor("window-glow"),
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
      }),
    [],
  );

  // 조명 원의 아래쪽에 고정된 반사 띠를 배치해 물 위 깜빡임을 막는다.
  useLayoutEffect(() => {
    for (let index = 0; index < count; index++) {
      const angle = (index * 2 * Math.PI) / count;
      object.position.set(
        center[0] + Math.cos(angle) * radius,
        y,
        center[1] + Math.sin(angle) * radius,
      );
      object.rotation.set(-Math.PI / 2, 0, angle);
      object.scale.set(radius * 0.11, radius * 0.24, 1);
      object.updateMatrix();
      mesh.current?.setMatrixAt(index, object.matrix);
    }
    if (mesh.current) mesh.current.instanceMatrix.needsUpdate = true;
  }, [center, y, radius, count, object]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, count]}
      frustumCulled={false}
    />
  );
}
