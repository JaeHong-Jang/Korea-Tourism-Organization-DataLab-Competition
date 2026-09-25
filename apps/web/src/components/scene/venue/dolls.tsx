// 예보 규모에 비례하는 블록 인형을 행사 모형 주변에 정적으로 배치한다.
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  Color,
  DoubleSide,
  type InstancedMesh,
  MeshBasicMaterial,
  Object3D,
} from "three";
import { dollFarGeometry } from "../crowd/doll-geometry";
import { sceneColor } from "../quality";

// 황금각 배열은 인형 수가 바뀌어도 기존 인형 자리를 유지한다.
export function VenueDolls({ count }: { count: number }) {
  const mesh = useRef<InstancedMesh>(null);
  const geometry = useMemo(dollFarGeometry, []);
  const material = useMemo(
    () => new MeshBasicMaterial({ side: DoubleSide }),
    [],
  );
  const object = useMemo(() => new Object3D(), []);
  const colors = useMemo(
    () =>
      Array.from(
        { length: 8 },
        (_, index) => new Color(sceneColor(`doll-${index + 1}`)),
      ),
    [],
  );

  // 인형 위치와 옷색은 시드가 없는 결정적 나선 배열로 한 번만 기록한다.
  useLayoutEffect(() => {
    if (!mesh.current) return;
    for (let index = 0; index < count; index++) {
      const angle = index * 2.399963229728653;
      const radius = 22 + Math.sqrt(index) * 4;
      object.position.set(
        Math.cos(angle) * radius,
        0.2,
        Math.sin(angle) * radius,
      );
      object.rotation.set(0, angle, 0);
      object.scale.set(1, 1, 1);
      object.updateMatrix();
      mesh.current.setMatrixAt(index, object.matrix);
      mesh.current.setColorAt(index, colors[index % colors.length]);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor)
      mesh.current.instanceColor.needsUpdate = true;
  }, [count, object, colors]);

  // 장면 교체 시 자체 형상과 재료를 해제한다.
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
