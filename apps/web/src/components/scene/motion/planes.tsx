// 공항 사이 하늘길로 동체·날개·꼬리날개로 만든 장난감 비행기가 뜨고 내린다(연출 — 실제 운항 아님).
import type { SceneQuality } from "../quality";
import { LAND_SURFACE_Y } from "../scene-height";
import { airways } from "./national-network";
import { type MoverPart, PartMovers } from "./part-movers";

const PLANE: MoverPart[] = [
  { color: "plane-body", offset: [0, 0, 0], scale: [0.22, 0.22, 1.6] },
  { color: "plane-body", offset: [0, 0, 0.1], scale: [1.5, 0.05, 0.32] },
  { color: "plane-body", offset: [0, 0.05, -0.72], scale: [0.6, 0.04, 0.18] },
  { color: "plane-tail", offset: [0, 0.22, -0.7], scale: [0.05, 0.36, 0.26] },
];

// 경로 앞뒤 18%에서 오르고 내리며 가운데는 순항 고도(장면 28단위 위)를 지킨다.
const CRUISE = 28;
export function planeHeight(share: number) {
  return (
    LAND_SURFACE_Y +
    0.6 +
    CRUISE * Math.min(1, share / 0.18, (1 - share) / 0.18)
  );
}

// 낮음 품질은 비행기를 그리지 않는다.
export function Planes({
  quality,
  reducedMotion,
}: {
  quality: SceneQuality;
  reducedMotion: boolean;
}) {
  if (quality === "low") return null;
  return (
    <PartMovers
      routes={airways}
      perRoute={1}
      parts={PLANE}
      size={5}
      speed={9}
      height={planeHeight}
      reducedMotion={reducedMotion}
    />
  );
}
