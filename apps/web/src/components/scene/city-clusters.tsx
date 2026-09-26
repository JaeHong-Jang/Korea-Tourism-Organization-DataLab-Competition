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
import type { Basemap } from "./basemap/national-basemap";
import { urbanTowers } from "./basemap/urban-towers";
import { insidePolygon, seededRandom } from "./city/free-space";
import type { LandAnchor } from "./land-anchor";
import type { MotionRoute } from "./motion/rail-lines";
import { townGroups } from "./national-towns";
import type { SceneQuality } from "./quality";
import { sceneColor } from "./quality";
import { LAND_SURFACE_Y } from "./scene-height";

export type Tower = {
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
    count: 56,
    spread: 0.55,
    cap: 3.2,
    low: 1.0,
    high: 4.0,
    size: [0.55, 1.0],
  },
  si: {
    count: 40,
    spread: 0.35,
    cap: 3.6,
    low: 0.5,
    high: 2.6,
    size: [0.5, 0.95],
  },
  gun: {
    count: 14,
    spread: 0.2,
    cap: 1.6,
    low: 0.25,
    high: 0.7,
    size: [0.45, 0.8],
  },
} as const;

// 이 높이보다 위에서 내려다보면 멀리서 보는 것으로 친다(전국 판 첫 화면은 약 590).
export const FAR_HEIGHT = 320;
// 이 높이보다 위면 전국 첫 화면처럼 아주 멀리서 보는 것으로 친다.
export const MID_HEIGHT = 480;

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
export type ClusterLayout = {
  towers: Tower[];
  groups: number;
  // 멀리서 한 채씩 보일 무리 수(중심 시가지만 — 읍면·길가 마을은 중간 확대부터).
  farGroups: number;
  // 중간 확대에서 그릴 앞쪽 건물 수(무리마다 네 채 + 실제 도시 지역 채움).
  midCount: number;
  centers: [number, number][];
};
export function clusterTowers(
  anchors: Map<string, LandAnchor>,
  avoid: [number, number][],
  quality: SceneQuality,
  roads: MotionRoute[] = [],
  lines: MotionRoute[] = [],
  basemap: Basemap | null = null,
): ClusterLayout {
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
  // 읍·면 마을과 길가 마을을 더하고, 무리마다 가장 높은 건물부터 한 채씩 번갈아 적어 앞쪽 일부만 그려도 전국에 고르게 보이게 한다.
  const towns = townGroups(anchors, avoid, roads, lines, SHARE[quality]);
  rounds.push(...towns.groups);
  const interleaved: Tower[] = [];
  for (let round = 0; rounds.some((list) => round < list.length); round++)
    for (const list of rounds)
      if (round < list.length) interleaved.push(list[round]);
  // 실제 도시 지역 채움 건물은 무리 건물과 겹치는 자리를 건너뛰고, 중간 확대부터 보이도록 무리마다 네 채 바로 뒤에 넣는다.
  const taken = new Set(
    interleaved.map((tower) => `${Math.round(tower.x)}:${Math.round(tower.z)}`),
  );
  const urban = basemap
    ? urbanTowers(basemap, avoid, SHARE[quality]).filter(
        (tower) => !taken.has(`${Math.round(tower.x)}:${Math.round(tower.z)}`),
      )
    : [];
  const head = interleaved.slice(0, rounds.length * 4);
  const towers = [...head, ...urban, ...interleaved.slice(head.length)];
  const centers: [number, number][] = [
    ...[...anchors.values()].map((anchor): [number, number] => [
      anchor.x,
      anchor.z,
    ]),
    ...towns.centers,
  ];
  return {
    towers,
    groups: rounds.length,
    farGroups: rounds.length - towns.groups.length,
    midCount: head.length + urban.length,
    centers,
  };
}

export function CityClusters({ layout }: { layout: ClusterLayout }) {
  const { towers, farGroups, midCount } = layout;
  const mesh = useRef<InstancedMesh>(null);
  const tier = useRef<number | null>(null);
  // 멀리(카메라 높이 480 위)는 중심 시가지마다 가장 높은 한 채, 중간(320~480)은 읍면·길가 마을까지 네 채와 도시 지역 채움, 가까이는 모두 그린다.
  useFrame(({ camera }) => {
    const target = mesh.current;
    const height = camera.position.y;
    const next = height > MID_HEIGHT ? 0 : height > FAR_HEIGHT ? 1 : 2;
    if (!target || next === tier.current) return;
    tier.current = next;
    target.count =
      next === 2 ? towers.length : next === 0 ? farGroups : midCount;
  });
  // 바닥이 땅 윗면에 닿도록 상자 원점을 아랫면으로 옮긴다.
  const box = useMemo(() => new BoxGeometry(1, 1, 1).translate(0, 0.5, 0), []);
  const material = useMemo(() => new MeshLambertMaterial(), []);

  // 흰·크림 아파트, 벽돌 빌라, 유리 오피스 색을 섞어 칠하고 행렬은 한 번만 적는다.
  useLayoutEffect(() => {
    const target = mesh.current;
    if (!target) return;
    // 건물 목록이 바뀌면 새 인스턴스에 멀리·가까이 개수를 다시 적용한다.
    tier.current = null;
    // 참고 이미지처럼 흰 건물(세 가지 명암) — 짙은 도시 바탕·녹색 숲 위에서 도드라진다.
    const colors = [1, 2, 3].map(
      (index) => new Color(sceneColor(`map-building-${index}`)),
    );
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
