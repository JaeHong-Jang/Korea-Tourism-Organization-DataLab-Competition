// 축제 위치 원의 좌표·고도·선택 판정과 전국 지형의 면 수 회귀를 검증한다.
import { describe, expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { festivalGroundGeometry, festivalRingRadius, RING_FACES } from './festival-ground-geometry';
import { terrainHeight, type ElevationGrid } from '../terrain/elevation';
import { drapeGeometry } from '../terrain/drape-geometry';
import { terrainDetailStep } from '../terrain/terrain-detail';
import { LAND_SURFACE_Y } from '../scene-height';

const grid: ElevationGrid = { minX: -10, minZ: -10, step: 10, width: 3, height: 3, values: new Uint16Array([0, 100, 200, 100, 200, 300, 200, 300, 400]) };

describe('축제 위치 원과 지형 상세 수준', () => {
  it('같은 장소의 축제도 임의로 이동하거나 누락하지 않고 같은 지형 높이에 표시한다', () => {
    const geometry = festivalGroundGeometry([[0, 0], [0, 0], [2, 2]], 0.1, grid, -1, '#256abf', '#ffffff');
    const p = geometry.getAttribute('position');
    expect(p.count / 3).toBe(3 * RING_FACES);
    const stride = RING_FACES * 3;
    for (let i = 0; i < stride; i++) {
      expect(p.getX(i)).toBe(p.getX(i + stride));
      expect(p.getZ(i)).toBe(p.getZ(i + stride));
    }
    for (let i = 0; i < p.count; i++) expect(p.getY(i)).toBeCloseTo(LAND_SURFACE_Y + 0.006 + terrainHeight(grid, p.getX(i), p.getZ(i)), 5);
    geometry.dispose();
  });
  it('작은 확대 변화는 같은 원 버퍼 크기를 사용하고 전국에서도 원을 숨기지 않는다', () => {
    expect(festivalRingRadius(1000, 1600)).toBe(festivalRingRadius(1001, 1600));
    expect(festivalRingRadius(1800, 1600)).toBeGreaterThan(1);
    expect(festivalRingRadius(0.1, 1600)).toBe(0.012);
  });
  it('전국 색면은 지역용 1.2km 분할보다 적은 면을 만들고 확대 시 60m 표본으로 복원한다', () => {
    const source = () => {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute([0, 9.5, 0, 0, 9.5, 30, 30, 9.5, 0], 3));
      geometry.setAttribute('color', new Float32BufferAttribute(new Array(9).fill(1), 3));
      return geometry;
    };
    const coarse = drapeGeometry(source(), grid, terrainDetailStep(1730));
    const old = drapeGeometry(source(), grid, 1.2);
    expect(coarse.getAttribute('position').count).toBeLessThan(old.getAttribute('position').count / 8);
    expect(terrainDetailStep(1.2)).toBe(0.06);
    expect(terrainDetailStep(100000)).toBe(8);
    coarse.dispose(); old.dispose();
  });
});
