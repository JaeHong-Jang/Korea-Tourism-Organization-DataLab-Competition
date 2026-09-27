// 중간 확대부터 축제 모형 아래에 밝은 바닥과 굵은 금색 테두리를 보여 준다.
import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { type Group, type InstancedMesh, Object3D } from "three";
import { festivalFootprintRadii } from "./festival-footprint-layout";
import type { PlacedFestival } from "./festival-models/placement";
import { LAND_SURFACE_Y } from "./scene-height";

// 축제 수와 관계없이 세 번의 인스턴스 그리기로 바닥 구분 표시를 만든다.
export function FestivalFootprints({ placed }: { placed: PlacedFestival[] }) {
  const group = useRef<Group>(null);
  const floor = useRef<InstancedMesh>(null);
  const border = useRef<InstancedMesh>(null);
  const edge = useRef<InstancedMesh>(null);
  const radii = useMemo(() => festivalFootprintRadii(placed), [placed]);

  // 데이터 모드의 지형 높이를 따라가며 기존 모형과 클릭 표면은 그대로 둔다.
  useLayoutEffect(() => {
    const transform = new Object3D();
    transform.rotation.x = -Math.PI / 2;
    for (const [layer, ref] of [floor, border, edge].entries()) {
      const mesh = ref.current;
      if (!mesh) continue;
      placed.forEach(({ x, y, z }, index) => {
        transform.position.set(x, LAND_SURFACE_Y + y + 0.3 + layer * 0.04, z);
        transform.scale.setScalar(radii[index]);
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [placed, radii]);

  // 중간 확대에서 테두리가 선명해지고 전국 보기로 멀어질 때만 숨긴다.
  useFrame(({ camera }) => {
    if (!group.current) return;
    const progress = Math.min(1, Math.max(0, (700 - camera.position.y) / 280));
    const opacity = progress * progress * (3 - 2 * progress);
    group.current.visible = opacity > 0.01;
    for (const [ref, strength] of [
      [floor, 0.3],
      [border, 0.95],
      [edge, 1],
    ] as const) {
      const material = ref.current?.material;
      if (material && !Array.isArray(material))
        material.opacity = opacity * strength;
    }
  });

  // 진단 모드에서는 실제 경계 개수를 확인하고 장면을 떠나면 지운다.
  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get("sceneDiagnostic") !== "1"
    )
      return;
    document.documentElement.dataset.sceneFootprints = String(placed.length);
    return () => {
      delete document.documentElement.dataset.sceneFootprints;
    };
  }, [placed.length]);

  return (
    <group ref={group} visible={false}>
      <instancedMesh ref={floor} args={[undefined, undefined, placed.length]}>
        <circleGeometry args={[0.89, 64]} />
        <meshBasicMaterial
          color="#fff4d8"
          transparent
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-5}
          polygonOffsetUnits={-5}
        />
      </instancedMesh>
      <instancedMesh ref={border} args={[undefined, undefined, placed.length]}>
        <ringGeometry args={[0.82, 1, 64]} />
        <meshBasicMaterial
          color="#25352f"
          transparent
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-6}
          polygonOffsetUnits={-6}
        />
      </instancedMesh>
      <instancedMesh ref={edge} args={[undefined, undefined, placed.length]}>
        <ringGeometry args={[0.86, 0.96, 64]} />
        <meshBasicMaterial
          color="#ffd66b"
          transparent
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-7}
          polygonOffsetUnits={-7}
        />
      </instancedMesh>
    </group>
  );
}
