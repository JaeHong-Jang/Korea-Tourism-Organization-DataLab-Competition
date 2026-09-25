// 전국 보기에는 가벼운 실루엣, 가까운 보기에는 블록 인형을 인스턴싱한다.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Color,
  DoubleSide,
  type InstancedMesh,
  MeshBasicMaterial,
} from "three";
import type { PlacedFestival } from "../festival-models/placement";
import { sceneColor } from "../quality";
import {
  dollBodyGeometry,
  dollFarGeometry,
  dollHeadGeometry,
} from "./doll-geometry";
import { buildDollLayout } from "./doll-layout";
import { addWalkPhases, enableWalking, walkingTime } from "./walk-material";

// 같은 행렬을 두 표현에 올리고 카메라가 가까워질 때만 상세 형상으로 바꾼다.
export function DollCrowd({
  placed,
  counts,
  center,
  reducedMotion = false,
}: {
  placed: PlacedFestival[];
  counts: number[];
  center: [number, number];
  reducedMotion?: boolean;
}) {
  const bodyRef = useRef<InstancedMesh>(null);
  const headRef = useRef<InstancedMesh>(null);
  const farRef = useRef<InstancedMesh>(null);
  const closeRef = useRef(false);
  const [close, setClose] = useState(false);
  const camera = useThree((state) => state.camera);
  const instances = useMemo(
    () => buildDollLayout(placed, counts),
    [placed, counts],
  );
  const bodyGeometry = useMemo(() => {
    const geometry = dollBodyGeometry();
    addWalkPhases(geometry, instances.length);
    return geometry;
  }, [instances.length]);
  const headGeometry = useMemo(() => {
    const geometry = dollHeadGeometry();
    addWalkPhases(geometry, instances.length);
    return geometry;
  }, [instances.length]);
  const farGeometry = useMemo(() => {
    const geometry = dollFarGeometry();
    addWalkPhases(geometry, instances.length);
    return geometry;
  }, [instances.length]);
  const bodyMaterial = useMemo(
    () => enableWalking(new MeshBasicMaterial({ side: DoubleSide })),
    [],
  );
  const headMaterial = useMemo(
    () =>
      enableWalking(
        new MeshBasicMaterial({
          color: sceneColor("doll-head"),
          side: DoubleSide,
        }),
      ),
    [],
  );
  const colors = useMemo(
    () =>
      Array.from(
        { length: 8 },
        (_, index) => new Color(sceneColor(`person-${index + 1}`)),
      ),
    [],
  );

  // 카메라 거리의 단일 경계에서만 React 상태를 바꿔 프레임 중 할당을 피한다.
  useFrame(({ clock }) => {
    walkingTime(bodyMaterial, clock.elapsedTime, reducedMotion);
    walkingTime(headMaterial, clock.elapsedTime, reducedMotion);
    const near =
      Math.hypot(
        camera.position.x - center[0],
        camera.position.y,
        camera.position.z - center[1],
      ) < 300;
    if (near !== closeRef.current) {
      closeRef.current = near;
      setClose(near);
    }
  });

  // 인스턴스 행렬과 옷 색을 두 거리 단계에 한 번씩 기록한다.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    const head = headRef.current;
    const far = farRef.current;
    if (!body || !head || !far) return;
    instances.forEach(({ matrix, colorIndex }, index) => {
      body.setMatrixAt(index, matrix);
      body.setColorAt(index, colors[colorIndex]);
      head.setMatrixAt(index, matrix);
      far.setMatrixAt(index, matrix);
      far.setColorAt(index, colors[colorIndex]);
    });
    for (const mesh of [body, head, far]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [instances, colors]);

  // 교체나 언마운트 때 두 거리 단계의 형상과 재료를 해제한다.
  useEffect(
    () => () => {
      bodyGeometry.dispose();
      headGeometry.dispose();
      farGeometry.dispose();
      bodyMaterial.dispose();
      headMaterial.dispose();
    },
    [bodyGeometry, headGeometry, farGeometry, bodyMaterial, headMaterial],
  );

  if (instances.length === 0) return null;
  return (
    <group>
      <instancedMesh
        ref={farRef}
        args={[farGeometry, bodyMaterial, instances.length]}
        visible={!close}
      />
      <instancedMesh
        ref={bodyRef}
        args={[bodyGeometry, bodyMaterial, instances.length]}
        visible={close}
      />
      <instancedMesh
        ref={headRef}
        args={[headGeometry, headMaterial, instances.length]}
        visible={close}
      />
    </group>
  );
}
