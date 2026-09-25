// 병합 모형을 유지하면서 행사별 포인터 선택 표면을 한 인스턴스 메시로 제공한다.
import { useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  type InstancedMesh,
  MeshBasicMaterial,
  Object3D,
} from "three";
import type { PlacedFestival } from "./festival-models/placement";
import { LAND_SURFACE_Y } from "./scene-height";

// 필터가 같은 개수의 다른 지역으로 바뀌어도 광선 판정 경계를 새 위치에 맞춘다.
export function positionHitTargets(
  mesh: InstancedMesh,
  placed: PlacedFestival[],
  dummy: Object3D,
) {
  placed.forEach(({ x, y, z }, index) => {
    dummy.position.set(x, LAND_SURFACE_Y + y + 6, z);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.computeBoundingBox();
}

// 같은 지오메트리·재질을 재사용하고 행사별 행렬만 목록 변경 때 갱신한다.
export function FestivalHitTargets({
  placed,
  onPick,
}: {
  placed: PlacedFestival[];
  onPick: (id: string) => void;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new BoxGeometry(12, 17, 12), []);
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    [],
  );
  const dummy = useMemo(() => new Object3D(), []);
  const canvas = useThree((state) => state.gl.domElement);

  // 모형을 새로 만들지 않고 클릭 표면의 위치만 행렬에 기록한다.
  useLayoutEffect(() => {
    if (!mesh.current) return;
    positionHitTargets(mesh.current, placed, dummy);
  }, [placed, dummy]);

  // 장면을 떠나면 인스턴스 자원을 GPU에서 해제한다.
  useLayoutEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      canvas.style.cursor = "";
    },
    [geometry, material, canvas],
  );
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Three.js 인스턴스는 HTML 요소가 아니며 키보드 선택은 이름표·목록에서 제공한다.
    <instancedMesh
      ref={mesh}
      args={[geometry, material, placed.length]}
      onPointerOver={() => {
        canvas.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        canvas.style.cursor = "";
      }}
      onClick={(event) => {
        event.stopPropagation();
        const festival = placed[event.instanceId ?? -1]?.festival;
        if (festival) onPick(festival.eventId);
      }}
    />
  );
}
