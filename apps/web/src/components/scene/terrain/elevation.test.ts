// 고도 보간과 도로·건물 높이 정합이 같은 좌표에서 유지되는지 검사한다.
import { describe, expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { terrainHeight, type ElevationGrid } from './elevation';
import { drapeGeometry } from './drape-geometry';
import { buildingGeometry, MAP_COLORS, type MapPalette } from '../national-map/map-geometry';
import { LAND_SURFACE_Y } from '../scene-height';

const grid: ElevationGrid = { minX: 0, minZ: 0, step: 1, width: 3, height: 3, values: new Uint16Array([0, 100, 200, 100, 200, 300, 200, 300, 400]) };

describe('공유 고도 지형', () => {
  it('미터를 km로 바꾸고 격자 경계 양쪽에서 연속 보간한다', () => {
    expect(terrainHeight(grid, 0.5, 0.5)).toBeCloseTo(0.16);
    expect(terrainHeight(grid, 1 - 1e-6, 0.5)).toBeCloseTo(terrainHeight(grid, 1 + 1e-6, 0.5), 5);
    expect(terrainHeight(grid, -1, 0)).toBe(0);
    expect(terrainHeight(undefined, 0, 0)).toBe(0);
  });
  it('표면 분할 후 모든 정점이 동일한 고도에 놓이고 유한한 법선을 가진다', () => {
    const source = new BufferGeometry();
    source.setAttribute('position', new Float32BufferAttribute([0, 9.5, 0, 0, 9.5, 1, 1, 9.5, 0], 3));
    source.setAttribute('color', new Float32BufferAttribute(new Array(9).fill(1), 3));
    const result = drapeGeometry(source, grid, 0.2);
    const positions = result.getAttribute('position');
    expect(positions.count).toBeGreaterThan(3);
    for (let i = 0; i < positions.count; i++) expect(positions.getY(i)).toBeCloseTo(9.5 + terrainHeight(grid, positions.getX(i), positions.getZ(i)), 5);
    expect([...result.getAttribute('normal').array].every(Number.isFinite)).toBe(true);
    result.dispose();
  });
  it('경사지의 건물 지붕은 수평이며 가장 높은 지면 위에 원래 높이를 유지한다', () => {
    const palette = Object.fromEntries(MAP_COLORS.map((name) => [name, '#ffffff'])) as MapPalette;
    const result = buildingGeometry([{ id: 'slope', polygons: [[[[0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5], [0, 0]]]], height: 0.03, minHeight: 0, estimated: false }], palette, grid)!;
    const positions = result.getAttribute('position');
    const max = Math.max(...Array.from({ length: positions.count }, (_, i) => positions.getY(i)));
    expect(max).toBeCloseTo(LAND_SURFACE_Y + 0.003 + 0.16 + 0.03, 5);
    result.dispose();
  });
});
