// 여객선 항로를 흉내 낸 뱃길 위로 선체·객실·조타실·굴뚝으로 만든 장난감 배를 띄운다(연출 — 실제 운항 아님).
import type { SceneQuality } from "../quality";
import { seaways } from "./national-network";
import { type MoverPart, PartMovers } from "./part-movers";

// 바다 윗면 높이(판 위 바다 면 5.5)에 선체 바닥을 맞춘다.
const SEA_Y = 5.55;
const SHIP: MoverPart[] = [
  { color: "ship-hull", offset: [0, 0.15, 0], scale: [0.5, 0.3, 1.6] },
  { color: "ship-cabin", offset: [0, 0.45, -0.1], scale: [0.42, 0.32, 0.95] },
  { color: "ship-cabin", offset: [0, 0.72, 0.2], scale: [0.34, 0.22, 0.3] },
  { color: "ship-funnel", offset: [0, 0.8, -0.35], scale: [0.13, 0.28, 0.13] },
];

// 품질별 항로당 배 수(낮음은 한 척씩).
export function shipsPerRoute(quality: SceneQuality) {
  return quality === "low" ? 1 : 2;
}

export function Ships({
  quality,
  reducedMotion,
}: {
  quality: SceneQuality;
  reducedMotion: boolean;
}) {
  return (
    <PartMovers
      routes={seaways}
      perRoute={shipsPerRoute(quality)}
      parts={SHIP}
      size={3}
      speed={2.2}
      height={() => SEA_Y}
      reducedMotion={reducedMotion}
    />
  );
}
