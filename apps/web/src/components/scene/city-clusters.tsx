// 전국 판 시군구마다 행정 구분(구·시·군)에 맞춘 장난감 건물 무리를 세운다(연출 — 실제 건물 위치·높이 아님).
import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  Color,
  type InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
} from "three";
import { insidePolygon, seededRandom } from "./city/free-space";
import type { LandAnchor } from "./land-anchor";
import type { SceneQuality } from "./quality";
import { sceneColor } from "./quality";
import { LAND_SURFACE_Y } from "./scene-height";

type Tower = {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  tone: number;
};

// 구는 빽빽하고 높게, 시는 넓고 중간, 군은 읍내 몇 채(개수·퍼짐 반경 상한 km·높이 범위).
const STYLE = {
  gu: {
    count: 34,
    spread: 0.55,
    cap: 3.2,
    low: 1.0,
    high: 4.0,
    size: [0.35, 0.7],
  },
  si: {
    count: 26,
    spread: 0.35,
    cap: 3.6,
    low: 0.5,
    high: 2.6,
    size: [0.3, 0.65],
  },
  gun: {
    count: 9,
    spread: 0.2,
    cap: 1.6,
    low: 0.25,
    high: 0.7,
    size: [0.28, 0.5],
  },
} as const;

// 이 높이보다 위에서 내려다보면 멀리서 보는 것으로 친다(전국 판 첫 화면은 약 590).
export const FAR_HEIGHT = 320;

// 품질별로 건물 수를 줄인다(낮음은 무리마다 몇 채만).
const SHARE: Record<SceneQuality, number> = { high: 1, medium: 0.6, low: 0.3 };

// 시군구 이름 끝 글자로 구·시·군을 가른다.
export function styleOf(name: string) {
  return name.endsWith("구")
    ? STYLE.gu
    : name.endsWith("시")
      ? STYLE.si
      : STYLE.gun;
}

// 건물 무리가 퍼지는 반경(km) — 시군구 땅 크기에 비례하되 종류별 상한을 둔다.
export function clusterSpread(anchor: LandAnchor) {
  const style = styleOf(anchor.name);
  return Math.min(style.cap, anchor.radius * style.spread);
}

// 대표점 둘레에 가운데일수록 높은 건물을 흩되, 땅 밖·행사 표시 자리(2km 안)·다른 건물과 겹치는 자리는 건너뛴다.
export function clusterTowers(
  anchors: Map<string, LandAnchor>,
  avoid: [number, number][],
  quality: SceneQuality,
): Tower[] {
  const rounds: Tower[][] = [];
  for (const [code, anchor] of anchors) {
    const style = styleOf(anchor.name);
    const random = seededRandom(Number(code) || 1);
    const spread = clusterSpread(anchor);
    const count = Math.max(1, Math.round(style.count * SHARE[quality]));
    const placed: Tower[] = [];
    for (
      let attempt = 0;
      placed.length < count && attempt < count * 4;
      attempt++
    ) {
      const angle = random() * Math.PI * 2;
      const reach = spread * Math.sqrt(random());
      const x = anchor.x + Math.cos(angle) * reach;
      const z = anchor.z + Math.sin(angle) * reach;
      const width = style.size[0] + random() * (style.size[1] - style.size[0]);
      const depth = style.size[0] + random() * (style.size[1] - style.size[0]);
      const near = 1 - (reach / Math.max(spread, 0.01)) * 0.6;
      const height = (style.low + random() * (style.high - style.low)) * near;
      if (
        !insidePolygon(x, z, anchor.ring) ||
        avoid.some(([ax, az]) => Math.hypot(ax - x, az - z) < 2) ||
        placed.some(
          (item) =>
            Math.hypot(item.x - x, item.z - z) < (item.width + width) / 2,
        )
      )
        continue;
      placed.push({ x, z, width, depth, height, tone: random() });
    }
    placed.sort((a, b) => b.height - a.height);
    rounds.push(placed);
  }
  // 무리마다 가장 높은 건물부터 한 채씩 번갈아 적어, 앞쪽 일부만 그려도 모든 도시가 보이게 한다.
  const towers: Tower[] = [];
  for (let round = 0; rounds.some((list) => round < list.length); round++)
    for (const list of rounds)
      if (round < list.length) towers.push(list[round]);
  return towers;
}

export function CityClusters({
  anchors,
  avoid,
  quality,
}: {
  anchors: Map<string, LandAnchor>;
  avoid: [number, number][];
  quality: SceneQuality;
}) {
  const towers = useMemo(
    () => clusterTowers(anchors, avoid, quality),
    [anchors, avoid, quality],
  );
  const mesh = useRef<InstancedMesh>(null);
  const far = useRef<boolean | null>(null);
  // 멀리서(카메라 높이 320 위)는 무리마다 가장 높은 한 채만 그린다 — 나머지는 점보다 작다.
  useFrame(({ camera }) => {
    const target = mesh.current;
    const next = camera.position.y > FAR_HEIGHT;
    if (!target || next === far.current) return;
    far.current = next;
    target.count = next
      ? Math.min(towers.length, anchors.size)
      : towers.length;
  });
  // 바닥이 땅 윗면에 닿도록 상자 원점을 아랫면으로 옮긴다.
  const box = useMemo(() => new BoxGeometry(1, 1, 1).translate(0, 0.5, 0), []);
  const material = useMemo(() => new MeshLambertMaterial(), []);

  // 흰·크림 아파트, 벽돌 빌라, 유리 오피스 색을 섞어 칠하고 행렬은 한 번만 적는다.
  useLayoutEffect(() => {
    const target = mesh.current;
    if (!target) return;
    // 건물 목록이 바뀌면 새 인스턴스에 멀리·가까이 개수를 다시 적용한다.
    far.current = null;
    const colors = [
      ...[1, 2, 3, 4].map((i) => sceneColor(`bldg-apartment-${i}`)),
      sceneColor("bldg-villa-1"),
      sceneColor("bldg-villa-3"),
      sceneColor("bldg-office-glass"),
      sceneColor("bldg-shop-2"),
    ].map((value) => new Color(value));
    const matrix = new Matrix4();
    towers.forEach((tower, index) => {
      matrix.makeScale(tower.width, tower.height, tower.depth);
      matrix.setPosition(tower.x, LAND_SURFACE_Y, tower.z);
      target.setMatrixAt(index, matrix);
      target.setColorAt(index, colors[Math.floor(tower.tone * colors.length)]);
    });
    target.instanceMatrix.needsUpdate = true;
    if (target.instanceColor) target.instanceColor.needsUpdate = true;
    target.computeBoundingSphere();
  }, [towers]);

  // 형상·재료는 화면을 떠날 때 해제한다.
  useEffect(
    () => () => {
      box.dispose();
      material.dispose();
    },
    [box, material],
  );

  if (!towers.length) return null;
  return (
    <instancedMesh
      key={towers.length}
      ref={mesh}
      args={[box, material, towers.length]}
    />
  );
}
