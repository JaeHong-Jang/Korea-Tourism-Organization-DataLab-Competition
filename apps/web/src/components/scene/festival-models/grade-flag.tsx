// 행사 등급 깃대와 색 깃발을 각각 한 번의 인스턴싱으로 그린다.
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  type InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
} from "three";
import { sceneColor } from "../quality";
import { LAND_BASE_Y } from "../scene-height";
import type { PlacedFestival } from "./placement";

// 깃발 위치와 등급 색을 행사별 인스턴스 버퍼에 기록한다.
export function GradeFlags({ placed }: { placed: PlacedFestival[] }) {
  const poles = useRef<InstancedMesh>(null);
  const flags = useRef<InstancedMesh>(null);
  const poleGeometry = useMemo(
    () => new CylinderGeometry(0.07, 0.07, 3.4, 6),
    [],
  );
  const flagGeometry = useMemo(() => new BoxGeometry(1.15, 0.62, 0.12), []);
  const poleMaterial = useMemo(
    () => new MeshStandardMaterial({ color: sceneColor("model-metal") }),
    [],
  );
  const flagMaterial = useMemo(
    () => new MeshStandardMaterial({ roughness: 1 }),
    [],
  );
  const colors = useMemo(
    () =>
      [1, 2, 3, 4].map(
        (level) =>
          new Color(
            getComputedStyle(document.documentElement)
              .getPropertyValue(`--level-${level}`)
              .trim(),
          ),
      ),
    [],
  );

  // 같은 단위 행렬을 재사용하며 깃대와 깃발의 위치를 함께 설정한다.
  useLayoutEffect(() => {
    const pole = poles.current;
    const flag = flags.current;
    if (!pole || !flag) return;
    const matrix = new Matrix4();
    placed.forEach(({ festival, x, z }, index) => {
      matrix.makeTranslation(x + 2.35, LAND_BASE_Y + 4.4, z);
      pole.setMatrixAt(index, matrix);
      matrix.makeTranslation(x + 2.9, LAND_BASE_Y + 5.5, z);
      flag.setMatrixAt(index, matrix);
      flag.setColorAt(
        index,
        colors[Math.min(4, Math.max(1, festival.level)) - 1],
      );
    });
    pole.instanceMatrix.needsUpdate = true;
    flag.instanceMatrix.needsUpdate = true;
    if (flag.instanceColor) flag.instanceColor.needsUpdate = true;
    pole.computeBoundingSphere();
    flag.computeBoundingSphere();
  }, [placed, colors]);

  // 인스턴스가 사라질 때 직접 만든 GPU 자원을 해제한다.
  useEffect(
    () => () => {
      poleGeometry.dispose();
      flagGeometry.dispose();
      poleMaterial.dispose();
      flagMaterial.dispose();
    },
    [poleGeometry, flagGeometry, poleMaterial, flagMaterial],
  );

  return (
    <group>
      <instancedMesh
        ref={poles}
        args={[poleGeometry, poleMaterial, placed.length]}
      />
      <instancedMesh
        ref={flags}
        args={[flagGeometry, flagMaterial, placed.length]}
      />
    </group>
  );
}
