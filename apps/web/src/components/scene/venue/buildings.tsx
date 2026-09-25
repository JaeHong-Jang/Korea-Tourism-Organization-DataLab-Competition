// 실제 건물 위치와 높이를 블록 건물 인스턴스로 세운다.
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  type InstancedMesh,
  MeshStandardMaterial,
  Object3D,
} from "three";
import { sceneColor } from "../quality";
import type { VenueBuilding, VenueStation } from "./tiles";

// 가까운 건물부터 품질 단계에 맞는 상한만 렌더링한다.
export function buildingCap(quality: "high" | "medium" | "low"): number {
  return quality === "high" ? 2400 : quality === "medium" ? 1200 : 600;
}

// 건물과 역 표지는 각각 한 인스턴스 메시로 그린다.
export function VenueBuildings({
  buildings,
  stations,
  quality,
  night,
}: {
  buildings: VenueBuilding[];
  stations: VenueStation[];
  quality: "high" | "medium" | "low";
  night: boolean;
}) {
  const chosen = useMemo(
    () => buildings.slice(0, buildingCap(quality)),
    [buildings, quality],
  );
  const marks = useMemo(() => stations.slice(0, 32), [stations]);
  const body = useRef<InstancedMesh>(null);
  const windows = useRef<InstancedMesh>(null);
  const station = useRef<InstancedMesh>(null);
  const object = useMemo(() => new Object3D(), []);
  const box = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const markBox = useMemo(() => new BoxGeometry(8, 1, 8), []);
  const wall = useMemo(
    () =>
      new MeshStandardMaterial({
        color: sceneColor("model-canvas"),
        roughness: 1,
      }),
    [],
  );
  const glow = useMemo(
    () =>
      new MeshStandardMaterial({
        color: sceneColor("window-glow"),
        emissive: sceneColor("window-glow"),
        emissiveIntensity: 1.3,
      }),
    [],
  );
  const metal = useMemo(
    () =>
      new MeshStandardMaterial({
        color: sceneColor("model-metal"),
        roughness: 1,
      }),
    [],
  );

  // 같은 임시 행렬을 건물과 창문 띠에 재사용한다.
  useLayoutEffect(() => {
    chosen.forEach((building, index) => {
      const height = building.height - building.minHeight;
      object.position.set(
        building.x,
        building.minHeight + height / 2,
        building.z,
      );
      object.scale.set(building.width, height, building.depth);
      object.updateMatrix();
      body.current?.setMatrixAt(index, object.matrix);
      object.position.y = Math.min(
        building.height - 0.5,
        building.minHeight + height * 0.65,
      );
      object.scale.set(building.width * 1.01, 0.25, building.depth * 1.01);
      object.updateMatrix();
      if (night) windows.current?.setMatrixAt(index, object.matrix);
    });
    marks.forEach(({ point }, index) => {
      object.position.set(point[0], 1, point[1]);
      object.scale.set(1, 1, 1);
      object.updateMatrix();
      station.current?.setMatrixAt(index, object.matrix);
    });
    for (const mesh of [body.current, windows.current, station.current])
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
  }, [chosen, marks, object, night]);

  // 교체와 언마운트 때 인스턴스 버퍼에 속한 리소스를 해제한다.
  useEffect(
    () => () => {
      box.dispose();
      markBox.dispose();
      wall.dispose();
      glow.dispose();
      metal.dispose();
    },
    [box, markBox, wall, glow, metal],
  );

  return (
    <group>
      <instancedMesh
        ref={body}
        args={[box, wall, chosen.length]}
        frustumCulled={false}
        castShadow={quality === "high"}
      />
      {night && (
        <instancedMesh
          ref={windows}
          args={[box, glow, chosen.length]}
          frustumCulled={false}
        />
      )}
      <instancedMesh
        ref={station}
        args={[markBox, metal, marks.length]}
        frustumCulled={false}
      />
    </group>
  );
}
