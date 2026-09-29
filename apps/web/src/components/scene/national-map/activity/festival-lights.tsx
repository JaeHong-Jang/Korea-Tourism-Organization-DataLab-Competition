// 축제의 야간 등은 인스턴싱하고 기존 불꽃은 야간 불꽃 행사에서만 짧게 보여 준다.
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Group, type InstancedMesh, Object3D } from "three";
import { Fireworks } from "../../effects/fireworks";
import type { FestivalProp } from "../../../../features/regional-diorama/festival-layout";

// 부스 개수와 무관하게 한 번의 그리기로 따뜻한 등불을 유지한다.
export function FestivalLights({ props }: { props: FestivalProp[] }) {
  const ref = useRef<InstancedMesh>(null),
    object = useMemo(() => new Object3D(), []);
  useLayoutEffect(() => {
    if (!ref.current) return;
    props.forEach((p, i) => {
      object.position.set(p.x, (p.y ?? 0) + 6, p.z);
      object.scale.set(Math.min(10, p.width), 0.5, 0.5);
      object.updateMatrix();
      ref.current!.setMatrixAt(i, object.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [props, object]);
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, props.length]}
      frustumCulled={false}
    >
      <boxGeometry />
      <meshBasicMaterial color="#ffdda1" />
    </instancedMesh>
  );
}

// 낮·모션 줄이기에서는 호출하지 않으며 18초 중 5초만 기존 폭죽을 재사용한다.
export function FestivalFireworks({ height }: { height: number }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (ref.current)
      ref.current.visible = !document.hidden && clock.elapsedTime % 18 < 5;
  });
  return (
    <group ref={ref}>
      <Fireworks
        position={[0, height + 55, 0]}
        quality="medium"
        reducedMotion={false}
      />
    </group>
  );
}
