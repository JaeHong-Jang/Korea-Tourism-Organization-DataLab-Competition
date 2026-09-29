// 확대 영역의 지면만 촘촘한 격자로 만들어 전국 지형의 삼각형 수를 늘리지 않는다.
import { BufferGeometry, Color, Float32BufferAttribute } from 'three';
import { projectKorea } from '../projection';
import { LAND_SURFACE_Y } from '../scene-height';
import type { MapViewport } from '../national-map/types';
import { terrainHeight, type ElevationGrid } from './elevation';

// 카메라에 보이는 범위에 여유를 두고 국토 안쪽 삼각형만 만든다.
export function localGround(view: MapViewport, grid: ElevationGrid, contains: (point: [number, number]) => boolean, color: string): BufferGeometry | null {
  if (view.width > 160) return null;
  const corners = [[view.bounds[0], view.bounds[1]], [view.bounds[2], view.bounds[3]]].map(([lng, lat]) => projectKorea(lng, lat));
  const step = Math.max(0.06, Math.min(0.5, view.width / 180));
  const padding = step * 3;
  const x0 = Math.floor((Math.min(corners[0][0], corners[1][0]) - padding) / step) * step;
  const z0 = Math.floor((Math.min(corners[0][1], corners[1][1]) - padding) / step) * step;
  const x1 = Math.max(corners[0][0], corners[1][0]) + padding;
  const z1 = Math.max(corners[0][1], corners[1][1]) + padding;
  const positions: number[] = [], colors: number[] = [], shade = new Color(color);
  for (let z = z0; z < z1; z += step) for (let x = x0; x < x1; x += step) {
    for (const triangle of [[[x, z], [x, z + step], [x + step, z]], [[x + step, z], [x, z + step], [x + step, z + step]]]) {
      if (!contains([triangle.reduce((sum, p) => sum + p[0], 0) / 3, triangle.reduce((sum, p) => sum + p[1], 0) / 3])) continue;
      for (const [px, pz] of triangle) {
        positions.push(px, LAND_SURFACE_Y + terrainHeight(grid, px, pz), pz);
        colors.push(shade.r, shade.g, shade.b);
      }
    }
  }
  const result = new BufferGeometry();
  result.setAttribute('position', new Float32BufferAttribute(positions, 3));
  result.setAttribute('color', new Float32BufferAttribute(colors, 3));
  result.computeVertexNormals();
  return result;
}
