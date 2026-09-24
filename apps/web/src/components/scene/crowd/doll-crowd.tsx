// 한 번 만든 행렬을 옷·머리 두 인스턴스 메쉬에 적용한다.
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Color, type InstancedMesh, MeshStandardMaterial } from "three";
import type { PlacedFestival } from "../festival-models/placement";
import { sceneColor } from "../quality";
import { dollBodyGeometry, dollHeadGeometry } from "./doll-geometry";
import { buildDollLayout } from "./doll-layout";

// 군중 수나 품질 단계가 바뀌면 배치와 GPU 버퍼를 함께 갱신한다.
export function DollCrowd({
  placed,
  counts,
  shadows,
}: {
  placed: PlacedFestival[];
  counts: number[];
  shadows: boolean;
}) {
  const bodyRef = useRef<InstancedMesh>(null);
  const headRef = useRef<InstancedMesh>(null);
  const instances = useMemo(
    () => buildDollLayout(placed, counts),
    [placed, counts],
  );
  const bodyGeometry = useMemo(dollBodyGeometry, []);
  const headGeometry = useMemo(dollHeadGeometry, []);
  const bodyMaterial = useMemo(
    () => new MeshStandardMaterial({ roughness: 1 }),
    [],
  );
  const headMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: sceneColor("doll-head"),
        roughness: 1,
      }),
    [],
  );
  const colors = useMemo(
    () =>
      Array.from(
        { length: 8 },
        (_, index) => new Color(sceneColor(`doll-${index + 1}`)),
      ),
    [],
  );

  // 인스턴스 행렬과 옷 색을 한 번만 쓰고 GPU에 갱신을 알린다.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    const head = headRef.current;
    if (!body || !head) return;
    instances.forEach(({ matrix, colorIndex }, index) => {
      body.setMatrixAt(index, matrix);
      body.setColorAt(index, colors[colorIndex]);
      head.setMatrixAt(index, matrix);
    });
    body.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
    body.computeBoundingSphere();
    head.computeBoundingSphere();
  }, [instances, colors]);

  // 교체나 언마운트 때 형상과 재료를 GPU에서 해제한다.
  useEffect(
    () => () => {
      bodyGeometry.dispose();
      headGeometry.dispose();
      bodyMaterial.dispose();
      headMaterial.dispose();
    },
    [bodyGeometry, headGeometry, bodyMaterial, headMaterial],
  );

  if (instances.length === 0) return null;
  return (
    <group>
      <instancedMesh
        ref={bodyRef}
        args={[bodyGeometry, bodyMaterial, instances.length]}
        castShadow={shadows}
      />
      <instancedMesh
        ref={headRef}
        args={[headGeometry, headMaterial, instances.length]}
        castShadow={shadows}
      />
    </group>
  );
}
