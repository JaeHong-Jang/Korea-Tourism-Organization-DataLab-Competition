// 행사장 건물을 공간 타일마다 하나의 형상으로 묶는다.
import {
  BoxGeometry,
  type BufferGeometry,
  type Color,
  Float32BufferAttribute,
  Matrix4,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { VenueBuilding } from "./tiles";

const TILE_METERS = 600;

// 낮은 품질에서 건물 높이를 계단식으로 줄여 지붕 윤곽을 단순화한다.
export function displayBuildingHeight(
  building: VenueBuilding,
  quality: "high" | "medium" | "low",
): number {
  const raw = building.height - building.minHeight;
  return quality === "high" ? raw : Math.max(2.5, Math.round(raw / 8) * 8);
}

// 한 타일의 모든 상자를 병합해 화면에는 타일마다 한 번만 제출한다.
export function mergeBuildingTiles(
  buildings: VenueBuilding[],
  quality: "high" | "medium" | "low",
  night: boolean,
  colors: { wall: Color; window: Color },
): BufferGeometry[] {
  const tiles = new Map<string, VenueBuilding[]>();
  for (const building of buildings) {
    const key = `${Math.floor((building.x + 1200) / TILE_METERS)}:${Math.floor((building.z + 1200) / TILE_METERS)}`;
    const group = tiles.get(key) ?? [];
    group.push(building);
    tiles.set(key, group);
  }
  const box = new BoxGeometry(1, 1, 1);
  const matrix = new Matrix4();
  const merged: BufferGeometry[] = [];
  for (const group of tiles.values()) {
    const pieces = group.flatMap((building) => {
      const height = displayBuildingHeight(building, quality);
      matrix.makeScale(building.width, height, building.depth);
      const body = box.clone().applyMatrix4(matrix);
      body.translate(building.x, building.minHeight + height / 2, building.z);
      const parts = [coloredBox(body, colors.wall)];
      if (night) {
        matrix.makeScale(building.width * 1.01, 0.25, building.depth * 1.01);
        const band = box.clone().applyMatrix4(matrix);
        band.translate(
          building.x,
          Math.min(
            building.minHeight + height - 0.5,
            building.minHeight + height * 0.65,
          ),
          building.z,
        );
        parts.push(coloredBox(band, colors.window));
      }
      return parts;
    });
    const tile = mergeGeometries(pieces, false);
    pieces.forEach((piece) => {
      piece.dispose();
    });
    if (tile) merged.push(tile);
  }
  box.dispose();
  return merged;
}

// 벽과 창문 색을 같은 형상의 정점에 담아 야간에도 타일 한 번으로 그린다.
function coloredBox(geometry: BufferGeometry, color: Color): BufferGeometry {
  const count = geometry.getAttribute("position").count;
  const values = new Float32Array(count * 3);
  for (let index = 0; index < count; index++) {
    values[index * 3] = color.r;
    values[index * 3 + 1] = color.g;
    values[index * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new Float32BufferAttribute(values, 3));
  return geometry;
}
