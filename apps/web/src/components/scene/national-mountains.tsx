// 전국 판 군·시 땅에 낮은 다각형 산을 세운다 — 도시 무리·행사 자리·도로·철도·강을 피해 둔 연출(실제 산 위치·높이 아님).
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  Color,
  ConeGeometry,
  type InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
} from "three";
import { insidePolygon, seededRandom } from "./city/free-space";
import { clusterSpread } from "./city-clusters";
import type { LandAnchor } from "./land-anchor";
import type { MotionRoute } from "./motion/rail-lines";
import { sceneColor } from "./quality";
import { LAND_SURFACE_Y } from "./scene-height";

type Peak = {
  x: number;
  z: number;
  radius: number;
  height: number;
  tone: number;
};

// 점에서 경로 선분까지 가장 가까운 거리.
function distanceToRoutes(x: number, z: number, routes: MotionRoute[]) {
  let best = Infinity;
  for (const route of routes)
    for (let index = 1; index < route.points.length; index++) {
      const [ax, az] = route.points[index - 1];
      const [bx, bz] = route.points[index];
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.max(
        0,
        Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)),
      );
      best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
    }
  return best;
}

// 군은 산 여럿, 시는 몇 개, 구는 두지 않는다 — 땅 안·도시 무리 밖·길과 강에서 떨어진 자리만.
export function placePeaks(
  anchors: Map<string, LandAnchor>,
  avoid: [number, number][],
  lines: MotionRoute[],
): Peak[] {
  const peaks: Peak[] = [];
  for (const [code, anchor] of anchors) {
    const want = anchor.name.endsWith("군")
      ? 4
      : anchor.name.endsWith("시")
        ? 1
        : 0;
    if (!want) continue;
    const random = seededRandom((Number(code) || 1) * 7 + 3);
    const spread = clusterSpread(anchor);
    const reach = Math.max(spread * 2, anchor.radius * 0.9);
    const placed: Peak[] = [];
    for (
      let attempt = 0;
      placed.length < want && attempt < want * 6;
      attempt++
    ) {
      const angle = random() * Math.PI * 2;
      const distance = spread + 2 + random() * reach;
      const x = anchor.x + Math.cos(angle) * distance;
      const z = anchor.z + Math.sin(angle) * distance;
      const radius = 2 + random() * 2.6;
      if (
        !insidePolygon(x, z, anchor.ring) ||
        avoid.some(([ax, az]) => Math.hypot(ax - x, az - z) < radius + 2) ||
        placed.some(
          (peak) =>
            Math.hypot(peak.x - x, peak.z - z) < (peak.radius + radius) * 0.7,
        ) ||
        distanceToRoutes(x, z, lines) < radius + 1.5
      )
        continue;
      placed.push({
        x,
        z,
        radius,
        height: radius * (0.7 + random() * 0.6),
        tone: random(),
      });
    }
    peaks.push(...placed);
  }
  return peaks;
}

export function NationalMountains({
  anchors,
  avoid,
  lines,
}: {
  anchors: Map<string, LandAnchor>;
  avoid: [number, number][];
  lines: MotionRoute[];
}) {
  const peaks = useMemo(
    () => placePeaks(anchors, avoid, lines),
    [anchors, avoid, lines],
  );
  const mesh = useRef<InstancedMesh>(null);
  // 일곱 면 원뿔 — 바닥이 땅 윗면에 닿게 원점을 아랫면으로 옮긴다.
  const cone = useMemo(
    () => new ConeGeometry(1, 1, 7, 1).translate(0, 0.5, 0),
    [],
  );
  const material = useMemo(
    () => new MeshLambertMaterial({ flatShading: true }),
    [],
  );
  useLayoutEffect(() => {
    const target = mesh.current;
    if (!target) return;
    const colors = [1, 2, 3].map(
      (index) => new Color(sceneColor(`mountain-${index}`)),
    );
    const matrix = new Matrix4();
    peaks.forEach((peak, index) => {
      matrix.makeScale(peak.radius, peak.height, peak.radius);
      matrix.setPosition(peak.x, LAND_SURFACE_Y, peak.z);
      target.setMatrixAt(index, matrix);
      target.setColorAt(index, colors[Math.floor(peak.tone * colors.length)]);
    });
    target.instanceMatrix.needsUpdate = true;
    if (target.instanceColor) target.instanceColor.needsUpdate = true;
    target.computeBoundingSphere();
  }, [peaks]);
  useEffect(
    () => () => {
      cone.dispose();
      material.dispose();
    },
    [cone, material],
  );
  if (!peaks.length) return null;
  return (
    <instancedMesh
      key={peaks.length}
      ref={mesh}
      args={[cone, material, peaks.length]}
    />
  );
}
