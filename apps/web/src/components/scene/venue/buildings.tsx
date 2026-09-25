// 실제 건물을 공간 타일별 병합 형상으로 그리고 역 표지만 인스턴싱한다.
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  Color,
  type InstancedMesh,
  MeshStandardMaterial,
  Object3D,
} from "three";
import { sceneColor } from "../quality";
import { mergeBuildingTiles } from "./building-tiles";
import type { VenueBuilding, VenueStation } from "./tiles";

// 소프트웨어 렌더러에서도 밀집 시가지가 기준 프레임을 넘지 않게 제한한다.
export function buildingCap(quality: "high" | "medium" | "low"): number {
  return quality === "high" ? 700 : quality === "medium" ? 350 : 120;
}

// 건물은 타일마다 한 번, 역 표지는 전체를 한 번 그린다.
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
  const colors = useMemo(
    () => ({
      wall: new Color(sceneColor("model-canvas")),
      window: new Color(sceneColor("window-glow")),
    }),
    [],
  );
  const tiles = useMemo(
    () => mergeBuildingTiles(chosen, quality, night, colors),
    [chosen, quality, night, colors],
  );
  const marks = useMemo(() => stations.slice(0, 32), [stations]);
  const station = useRef<InstancedMesh>(null);
  const object = useMemo(() => new Object3D(), []);
  const markBox = useMemo(() => new BoxGeometry(8, 1, 8), []);
  const wall = useMemo(
    () => new MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
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

  // 역 표지는 수가 작으므로 같은 인스턴스 버퍼에 행렬만 기록한다.
  useLayoutEffect(() => {
    marks.forEach(({ point }, index) => {
      object.position.set(point[0], 1, point[1]);
      object.updateMatrix();
      station.current?.setMatrixAt(index, object.matrix);
    });
    if (station.current) station.current.instanceMatrix.needsUpdate = true;
  }, [marks, object]);

  // 타일 교체와 언마운트 때 병합 형상과 재료를 반환한다.
  useEffect(
    () => () => {
      tiles.forEach((tile) => {
        tile.dispose();
      });
    },
    [tiles],
  );
  useEffect(
    () => () => {
      markBox.dispose();
      wall.dispose();
      metal.dispose();
    },
    [markBox, wall, metal],
  );

  return (
    <group>
      {tiles.map((geometry) => (
        <mesh
          key={geometry.uuid}
          geometry={geometry}
          material={wall}
          castShadow={false}
          receiveShadow={quality === "high"}
        />
      ))}
      <instancedMesh
        ref={station}
        args={[markBox, metal, marks.length]}
        frustumCulled={false}
      />
    </group>
  );
}
