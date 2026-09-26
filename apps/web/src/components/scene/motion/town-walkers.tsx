// 전국 판 구·시 건물 무리 둘레 골목을 몸·머리로 만든 장난감 사람이 걷는다(연출 — 실제 사람 위치 아님).
import { useMemo } from "react";
import { clusterSpread, styleOf } from "../city-clusters";
import type { LandAnchor } from "../land-anchor";
import type { SceneQuality } from "../quality";
import { LAND_SURFACE_Y } from "../scene-height";
import { lineRoute } from "./national-network";
import { type MoverPart, PartMovers } from "./part-movers";
import type { MotionRoute } from "./rail-lines";

const SHIRTS = Array.from({ length: 8 }, (_, i) => `person-${i + 1}`);
const PERSON: MoverPart[] = [
  { color: SHIRTS, offset: [0, 0.9, 0], scale: [0.44, 0.62, 0.26] },
  {
    color: ["skin-1", "skin-2", "skin-3", "skin-4"],
    offset: [0, 1.45, 0],
    scale: [0.3, 0.32, 0.3],
  },
];

// 구·시 무리마다 건물 사이를 도는 네모 골목 하나(무리 반경의 70%, 시군구 코드로 돌린 방향).
export function townLoops(anchors: Map<string, LandAnchor>): MotionRoute[] {
  const loops: MotionRoute[] = [];
  for (const [code, anchor] of anchors) {
    if (styleOf(anchor.name).count < 20) continue;
    const half = Math.max(0.6, clusterSpread(anchor) * 0.7);
    const turn = ((Number(code) % 90) * Math.PI) / 180;
    const corner = (u: number, v: number): [number, number] => [
      anchor.x + (u * Math.cos(turn) - v * Math.sin(turn)) * half,
      anchor.z + (u * Math.sin(turn) + v * Math.cos(turn)) * half,
    ];
    loops.push(
      lineRoute(`${anchor.name} 골목`, [
        corner(-1, -1),
        corner(1, -1),
        corner(1, 1),
        corner(-1, 1),
        corner(-1, -1),
      ]),
    );
  }
  return loops;
}

// 낮음 품질은 걷는 사람을 그리지 않는다.
export function TownWalkers({
  anchors,
  quality,
  reducedMotion,
}: {
  anchors: Map<string, LandAnchor>;
  quality: SceneQuality;
  reducedMotion: boolean;
}) {
  const loops = useMemo(() => townLoops(anchors), [anchors]);
  if (quality === "low") return null;
  return (
    <PartMovers
      routes={loops}
      perRoute={quality === "high" ? 4 : 2}
      parts={PERSON}
      size={0.55}
      speed={0.35}
      height={() => LAND_SURFACE_Y}
      reducedMotion={reducedMotion}
      nearOnly
    />
  );
}
