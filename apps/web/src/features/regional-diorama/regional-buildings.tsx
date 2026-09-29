// 성남 3D 여행과 같은 베이지 벽·밝은 지붕으로 실제 건물 외곽선을 표현한다.
import { useEffect, useMemo } from "react";
import { Color, Float32BufferAttribute } from "three";
import { grayBuildingGeometry } from "../../components/scene/city/gray-building-geometry";
import type { VenueBuilding } from "../../components/scene/venue/tiles";

export function regionalBuildingGeometry(buildings: VenueBuilding[]) {
  const geometry = grayBuildingGeometry(buildings);
  if (!geometry) return null;
  const normals = geometry.getAttribute("normal");
  const wall = new Color("#c4bba7");
  const roof = new Color("#dfd8c8");
  const colors = new Float32Array(normals.count * 3);
  for (let i = 0; i < normals.count; i++)
    (normals.getY(i) > 0.5 ? roof : wall).toArray(colors, i * 3);
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return geometry;
}

export function RegionalBuildings({
  buildings,
}: {
  buildings: VenueBuilding[];
}) {
  const geometry = useMemo(
    () => regionalBuildingGeometry(buildings),
    [buildings],
  );
  useEffect(() => () => geometry?.dispose(), [geometry]);
  return geometry ? (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshLambertMaterial vertexColors />
    </mesh>
  ) : null;
}
