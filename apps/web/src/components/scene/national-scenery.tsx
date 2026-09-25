// 전국 판 풍경 연출 묶음 — 시군구 건물 무리·골목 사람, 고속도로축 차, 철도 열차, 뱃길 배, 하늘길 비행기(데이터 모드에서는 숨김).
import { useMemo } from "react";
import { CityClusters } from "./city-clusters";
import type { LandAnchor } from "./land-anchor";
import { Planes } from "./motion/planes";
import { RoadTraffic } from "./motion/road-traffic";
import { Ships } from "./motion/ships";
import { TownWalkers } from "./motion/town-walkers";
import { Trains } from "./motion/trains";
import type { SceneQuality } from "./quality";

export function NationalScenery({
  anchors,
  clusters,
  festivals,
  quality,
  reducedMotion,
  motion,
  diagnostic,
}: {
  anchors: Map<string, LandAnchor>;
  // 땅을 숨기면 건물 무리도 숨긴다.
  clusters: boolean;
  festivals: { x: number; z: number }[];
  quality: SceneQuality;
  reducedMotion: boolean;
  // 연출(건물 무리·움직임)을 끄면 T-433b 정적 기준 장면이 된다.
  motion: boolean;
  diagnostic: boolean;
}) {
  // 행사 모형·표시가 건물에 가리지 않게 행사 자리를 건물 무리에서 비운다.
  const avoid = useMemo(
    () => festivals.map(({ x, z }): [number, number] => [x, z]),
    [festivals],
  );
  return (
    <>
      {motion && (
        <>
          {clusters && (
            <CityClusters anchors={anchors} avoid={avoid} quality={quality} />
          )}
          <Trains reducedMotion={reducedMotion} diagnostic={diagnostic} />
          <RoadTraffic quality={quality} reducedMotion={reducedMotion} />
          <Ships quality={quality} reducedMotion={reducedMotion} />
          <Planes quality={quality} reducedMotion={reducedMotion} />
          {clusters && (
            <TownWalkers
              anchors={anchors}
              quality={quality}
              reducedMotion={reducedMotion}
            />
          )}
        </>
      )}
    </>
  );
}
