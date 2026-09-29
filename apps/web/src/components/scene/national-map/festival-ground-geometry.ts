// 축제 좌표마다 지형을 따르는 위치 원을 만들고 한 번에 그릴 버퍼로 합친다.
import { BufferGeometry, Color, Float32BufferAttribute } from 'three';
import { LAND_SURFACE_Y } from '../scene-height';
import { terrainHeight, type ElevationGrid } from '../terrain/elevation';
import type { MapPoint } from './types';

export const RING_SEGMENTS = 24;
export const RING_FACES = RING_SEGMENTS * 4;

// 축척을 단계화해 카메라의 작은 이동마다 형상을 다시 만들지 않는다.
export function festivalRingRadius(width: number, pixels: number): number {
  const radius = width * 7 / Math.max(320, pixels);
  return Math.max(0.012, Math.min(8, 2 ** (Math.round(Math.log2(radius) * 2) / 2)));
}

// 흰 테두리와 파란 안쪽 선을 같은 평면에 두고 실제 행사 경계와는 구분되는 위치 표식을 만든다.
export function festivalGroundGeometry(points: MapPoint[], radius: number, elevation: ElevationGrid | undefined, selected: number, color: string, halo: string) {
  const positions: number[] = [], colors: number[] = [];
  const ink = new Color(color), outline = new Color(halo);
  const add = (point: MapPoint, angle: number, distance: number, shade: Color) => {
    const x = point[0] + Math.cos(angle) * distance, z = point[1] + Math.sin(angle) * distance;
    positions.push(x, LAND_SURFACE_Y + 0.006 + terrainHeight(elevation, x, z), z);
    colors.push(shade.r, shade.g, shade.b);
  };
  for (let index = 0; index < points.length; index++) {
    const r = radius * (index === selected ? 1.4 : 1);
    for (const [inner, outer, shade] of [[0.62, 0.85, ink], [0.85, 1, outline]] as const) {
      for (let segment = 0; segment < RING_SEGMENTS; segment++) {
        const a = segment * Math.PI * 2 / RING_SEGMENTS, b = (segment + 1) * Math.PI * 2 / RING_SEGMENTS;
        for (const [angle, distance] of [[a, inner], [b, inner], [a, outer], [a, outer], [b, inner], [b, outer]]) add(points[index], angle, distance * r, shade);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}
