// 실제 시군구 경계를 도로와 다른 색의 점선으로 표시한다.
import { useEffect, useMemo } from "react";
import { BufferGeometry, Float32BufferAttribute } from "three";
import type { LandModel } from "../land-tiles";
import { LAND_SURFACE_Y } from "../scene-height";
import { terrainHeight } from "../terrain/elevation";

// 모든 구역의 선을 한 버퍼로 합치고 확대 화면에서만 읽을 수 있게 표시한다.
export function RegionBoundaries({ model, width, night }: { model: LandModel; width: number; night: boolean }) {
  const geometry = useMemo(() => {
    const points: number[] = [], distances: number[] = [];
    for (const ring of model.boundaries ?? []) {
      let distance = 0;
      for (let i = 1; i < ring.length; i++) {
        const [ax, az] = ring[i - 1], [bx, bz] = ring[i];
        const length = Math.hypot(bx - ax, bz - az), steps = Math.max(1, Math.ceil(length / 0.2));
        for (let part = 0; part < steps; part++) {
          for (const t of [part / steps, (part + 1) / steps]) {
            const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
            points.push(x, LAND_SURFACE_Y + 0.008 + terrainHeight(model.elevation, x, z), z);
            distances.push(distance + length * t);
          }
        }
        distance += length;
      }
    }
    const result = new BufferGeometry();
    result.setAttribute("position", new Float32BufferAttribute(points, 3));
    result.setAttribute("lineDistance", new Float32BufferAttribute(distances, 1));
    return result;
  }, [model]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const opacity = Math.max(0, Math.min(0.8, (200 - width) / 100));
  return (
    <lineSegments name="administrative-boundaries" geometry={geometry} renderOrder={5} visible={opacity > 0}>
      <lineDashedMaterial color={night ? "#d1bdf2" : "#72638a"} transparent opacity={opacity} depthWrite={false} dashSize={width / 220} gapSize={width / 600} />
    </lineSegments>
  );
}
