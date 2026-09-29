// 미니어처 바탕 위에 밝은 회색 건물만 배치하고 하나의 메시로 그린다.
import { useEffect, useMemo } from "react";
import { type SceneQuality, sceneColor } from "../quality";
import type { VenueBuilding } from "../venue/tiles";
import { cityBuildingCap } from "./city-buildings";
import { grayBuildingGeometry } from "./gray-building-geometry";

// 가까운 건물부터 표시하고 자료를 교체하면 이전 GPU 형상을 해제한다.
export function GrayCityBuildings({
  buildings,
  quality,
  night,
}: {
  buildings: VenueBuilding[];
  quality: SceneQuality;
  night: boolean;
}) {
  const geometry = useMemo(
    () => grayBuildingGeometry(buildings.slice(0, cityBuildingCap(quality))),
    [buildings, quality],
  );
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return (
    <mesh
      geometry={geometry}
      castShadow={quality === "high"}
      receiveShadow={quality === "high"}
    >
      <meshStandardMaterial
        color={sceneColor("building-gray")}
        roughness={0.95}
        metalness={0}
        emissive={sceneColor("building-gray")}
        emissiveIntensity={night ? 0.12 : 0}
      />
    </mesh>
  );
}
