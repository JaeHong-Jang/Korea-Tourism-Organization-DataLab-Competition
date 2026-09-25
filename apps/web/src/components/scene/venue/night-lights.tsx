// 행사장 밤과 노을에 가로등·무대 불빛을 작은 인스턴스 조명으로 표시한다.
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  type InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
} from "three";
import { type SceneQuality, sceneColor } from "../quality";

// 실제 광원은 무대 하나로 제한하고 나머지는 발광 재료로 비용을 줄인다.
export function VenueNightLights({ quality }: { quality: SceneQuality }) {
  const count = quality === "high" ? 12 : quality === "medium" ? 8 : 4;
  const posts = useRef<InstancedMesh>(null);
  const bulbs = useRef<InstancedMesh>(null);
  const object = useMemo(() => new Object3D(), []);
  const postGeometry = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const bulbGeometry = useMemo(() => new SphereGeometry(1, 6, 4), []);
  const postMaterial = useMemo(
    () => new MeshStandardMaterial({ color: sceneColor("model-metal") }),
    [],
  );
  const bulbMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: sceneColor("window-glow"),
        emissive: sceneColor("window-glow"),
        emissiveIntensity: 1.8,
      }),
    [],
  );

  // 행사 중심 바깥 원에 간격을 고정해 슬라이더 이동 시 조명 위치를 유지한다.
  useLayoutEffect(() => {
    for (let index = 0; index < count; index++) {
      const angle = (index * Math.PI * 2) / count;
      const x = Math.cos(angle) * 180;
      const z = Math.sin(angle) * 180;
      object.position.set(x, 7, z);
      object.scale.set(1.3, 14, 1.3);
      object.updateMatrix();
      posts.current?.setMatrixAt(index, object.matrix);
      object.position.y = 15;
      object.scale.setScalar(2.8);
      object.updateMatrix();
      bulbs.current?.setMatrixAt(index, object.matrix);
    }
    if (posts.current) posts.current.instanceMatrix.needsUpdate = true;
    if (bulbs.current) bulbs.current.instanceMatrix.needsUpdate = true;
  }, [count, object]);
  useEffect(
    () => () => {
      postGeometry.dispose();
      bulbGeometry.dispose();
      postMaterial.dispose();
      bulbMaterial.dispose();
    },
    [postGeometry, bulbGeometry, postMaterial, bulbMaterial],
  );
  return (
    <group>
      <instancedMesh ref={posts} args={[postGeometry, postMaterial, count]} />
      <instancedMesh ref={bulbs} args={[bulbGeometry, bulbMaterial, count]} />
    </group>
  );
}
