// 실제 건물 외곽선을 높이 자료대로 세우고 외벽 사진 없이 한 형상으로 합친다.
import { type BufferGeometry, ExtrudeGeometry, Shape } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { VenueBuilding } from "../venue/tiles";

// 임의 지붕·간판·추가 건물을 만들지 않고 원본 외곽선과 바닥 높이를 보존한다.
export function grayBuildingGeometry(
  buildings: VenueBuilding[],
): BufferGeometry | null {
  const parts: BufferGeometry[] = [];
  for (const building of buildings) {
    const points = building.footprint;
    if (
      !points ||
      points.length < 3 ||
      !points.every(([x, z]) => Number.isFinite(x) && Number.isFinite(z))
    )
      continue;
    const bottom = Math.max(0, building.minHeight);
    const top = building.height;
    if (!Number.isFinite(top) || !Number.isFinite(bottom) || top <= bottom)
      continue;
    const shape = new Shape();
    points.forEach(([x, z], index) => {
      if (index === 0) shape.moveTo(x, -z);
      else shape.lineTo(x, -z);
    });
    shape.closePath();
    const geometry = new ExtrudeGeometry(shape, {
      depth: top - bottom,
      steps: 1,
      bevelEnabled: false,
      curveSegments: 1,
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, bottom, 0);
    parts.push(geometry);
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  for (const geometry of parts) geometry.dispose();
  return merged;
}
