// 이름표가 묶인 전국 화면에서도 모든 축제의 실제 지면 위치를 원으로 표시한다.
import type { FestivalSummary } from '@crowdcast/contracts/types';
import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import { DoubleSide } from 'three';
import { projectKorea } from '../projection';
import { LAND_SURFACE_Y } from '../scene-height';
import { terrainHeight, type ElevationGrid } from '../terrain/elevation';
import { festivalGroundGeometry, festivalRingRadius, RING_FACES } from './festival-ground-geometry';

// 좌표·축척 단계·선택이 바뀔 때만 병합 버퍼를 교체한다.
export function FestivalGroundRings({ festivals, selectedId, width, elevation, night, onPick }: {
  festivals: FestivalSummary[]; selectedId: string | null; width: number; elevation?: ElevationGrid;
  night: boolean; onPick: (id: string) => void;
}) {
  const pixels = useThree(state => state.size.width);
  const [hovered, setHovered] = useState<number | null>(null);
  const points = useMemo(() => festivals.map(festival => projectKorea(festival.lng, festival.lat)), [festivals]);
  const radius = festivalRingRadius(width, pixels);
  const geometry = useMemo(() => {
    const css = getComputedStyle(document.documentElement);
    return festivalGroundGeometry(points, radius, elevation, festivals.findIndex(f => f.eventId === selectedId), css.getPropertyValue('--select').trim(), css.getPropertyValue('--on-brand').trim());
  }, [points, radius, elevation, festivals, selectedId, night]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const festival = hovered === null ? undefined : festivals[hovered];
  const point = hovered === null ? undefined : points[hovered];
  return <group name="festival-ground-rings" userData={{ count: festivals.length, radius, points }}>
    <mesh geometry={geometry} renderOrder={3.5}
      onPointerMove={event => { event.stopPropagation(); setHovered(Math.floor((event.faceIndex ?? 0) / RING_FACES)); }}
      onPointerOut={() => setHovered(null)}
      onClick={event => { event.stopPropagation(); const item = festivals[Math.floor((event.faceIndex ?? 0) / RING_FACES)]; if (item) onPick(item.eventId); }}>
      <meshBasicMaterial vertexColors side={DoubleSide} depthWrite={false} depthTest={false} />
    </mesh>
    {festival && point && <Html position={[point[0], LAND_SURFACE_Y + terrainHeight(elevation, ...point), point[1]]} center style={{ pointerEvents: 'none', whiteSpace: 'nowrap', transform: 'translateY(-28px)' }}>
      <span className="scene-terrain-credit" style={{ position: 'static', display: 'block' }}>{festival.name} · {festival.sigunguName}</span>
    </Html>}
  </group>;
}
