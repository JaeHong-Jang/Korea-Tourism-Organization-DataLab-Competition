// 전국 판 풍경 묶음 — 실제 바탕 지도(토지 피복·호수·도로), 시군구 건물 무리·마을·골목 사람, 주요 강, 실제 고속도로를 달리는 차, 철도 열차, 뱃길 배, 하늘길 비행기(데이터 모드에서는 숨김).
import { useEffect, useMemo, useState } from "react";
import { BasemapLayer } from "./basemap/basemap-layer";
import { highwayRoutes } from "./basemap/basemap-routes";
import {
  type Basemap,
  loadNationalBasemap,
  withinLand,
} from "./basemap/national-basemap";
import { CityClusters, clusterTowers } from "./city-clusters";
import type { LandAnchor } from "./land-anchor";
import { rivers } from "./motion/national-rivers";
import { Planes } from "./motion/planes";
import { railLines, roadRoutes } from "./motion/rail-lines";
import { Ribbons } from "./motion/ribbons";
import { RoadTraffic } from "./motion/road-traffic";
import { Ships } from "./motion/ships";
import { TownWalkers } from "./motion/town-walkers";
import { Trains } from "./motion/trains";
import type { SceneQuality } from "./quality";
import { LAND_SURFACE_Y } from "./scene-height";

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
  // 실제 지도(z7 토지 피복·호수·고속도로)를 한 번 읽는다 — 오기 전에는 도시를 이은 축으로 차를 돌린다.
  const [basemap, setBasemap] = useState<Basemap | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    loadNationalBasemap(controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setBasemap(withinLand(value, anchors));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [anchors]);
  const carRoutes = useMemo(
    () => (basemap ? highwayRoutes(basemap) : roadRoutes),
    [basemap],
  );
  // 마을은 도로·철도·강 위에 서지 않는다.
  const lines = useMemo(
    () => [...carRoutes, ...railLines, ...rivers],
    [carRoutes],
  );
  // 중심 시가지·읍면 마을·길가 마을·실제 도시 지역 채움 배치를 정한다(길가 마을은 실제 고속도로를 따라).
  const layout = useMemo(
    () => clusterTowers(anchors, avoid, quality, carRoutes, lines, basemap),
    [anchors, avoid, quality, carRoutes, lines, basemap],
  );
  return (
    <>
      {motion && (
        <>
          {clusters && <CityClusters layout={layout} />}
          <Ribbons
            routes={rivers}
            width={2.2}
            y={LAND_SURFACE_Y + 0.04}
            color="river"
          />
          {clusters && basemap && <BasemapLayer basemap={basemap} />}
          <Trains reducedMotion={reducedMotion} diagnostic={diagnostic} />
          <RoadTraffic
            quality={quality}
            reducedMotion={reducedMotion}
            routes={carRoutes}
          />
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
