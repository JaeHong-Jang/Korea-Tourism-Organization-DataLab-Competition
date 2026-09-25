// 고른 행사 동네를 성남식 3D 미니어처로 펼친다 — 실제 건물·길·녹지·물 위에 사람·차 연출.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../../../lib/theme/theme-provider";
import { FestivalModels } from "../festival-models";
import type { SceneQuality } from "../quality";
import { SkyScene } from "../sky/sky-scene";
import { VenueActors } from "../venue/actors";
import { graphRoutes, routeGraph, towardShare } from "../venue/routes";
import { loadCityTiles, type VenueTiles } from "../venue/tiles";
import { CityBuildings } from "./city-buildings";
import { CityControls } from "./city-controls";
import { CityGround } from "./city-ground";
import { CityLabels } from "./city-labels";
import { CITY_MOON, CityLight } from "./city-light";
import { CityWalkers } from "./city-walkers";
import "./city.css";

export type CityStatus = "loading" | "ready" | "error";

// 예보 인원에 비례해 행사장에 모인 인형 수를 정한다(1명당 인원은 범례에 표시).
export function gatheredDolls(peak: number) {
  return Math.round(
    Math.min(360, Math.max(24, Math.sqrt(Math.max(0, peak)) * 2.4)),
  );
}

// 타일을 읽는 동안에는 받침만 두고, 다 읽으면 건물·길·사람·차를 올린다.
export function CityScene({
  festival,
  quality,
  reducedMotion,
  onLeave,
  onStatus,
}: {
  festival: FestivalSummary;
  quality: SceneQuality;
  reducedMotion: boolean;
  onLeave: () => void;
  onStatus?: (status: CityStatus) => void;
}) {
  const [tiles, setTiles] = useState<VenueTiles | null>(null);
  const { sky, at } = useTheme();

  // 행사가 바뀌면 이전 요청을 취소하고 전국 z15 타일에서 새 동네를 읽는다.
  useEffect(() => {
    const controller = new AbortController();
    setTiles(null);
    onStatus?.("loading");
    loadCityTiles([festival.lng, festival.lat], controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setTiles(result);
        onStatus?.("ready");
        document.documentElement.dataset.cityBuildings = String(
          result.buildings.length,
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) onStatus?.("error");
      });
    return () => {
      controller.abort();
      delete document.documentElement.dataset.cityBuildings;
    };
  }, [festival.lng, festival.lat, onStatus]);

  const roads = useMemo(
    () => (tiles ? graphRoutes(routeGraph(tiles.roads), 48) : []),
    [tiles],
  );
  const rails = useMemo(
    () => (tiles ? graphRoutes(routeGraph(tiles.rails), 8) : []),
    [tiles],
  );
  const eventHour = Number(festival.startsAt.slice(11, 13)) || 18;
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(at),
  );
  const placed = useMemo(() => [{ festival, x: 0, y: 0, z: 0 }], [festival]);

  return (
    <>
      <SkyScene
        center={[0, 0]}
        quality={quality}
        reducedMotion={reducedMotion}
        moonOffset={CITY_MOON}
        moonSize={420}
      />
      <CityLight
        lng={festival.lng}
        lat={festival.lat}
        quality={quality}
        revision={tiles}
      />
      {tiles && <CityGround tiles={tiles} />}
      {tiles && (
        <CityBuildings
          buildings={tiles.buildings}
          quality={quality}
          night={sky === "night"}
        />
      )}
      <group position={[0, 2, 0]} scale={6}>
        <FestivalModels placed={placed} />
      </group>
      {tiles && (
        <CityWalkers
          routes={roads}
          gather={gatheredDolls(festival.peakP50)}
          towardShare={towardShare(hour, eventHour)}
          quality={quality}
          reducedMotion={reducedMotion}
        />
      )}
      {tiles && (
        <VenueActors
          roadRoutes={roads}
          railRoutes={rails}
          quality={quality}
          hour={hour}
          eventHour={eventHour}
          reducedMotion={reducedMotion}
          scale={3.2}
        />
      )}
      {tiles && <CityLabels festival={festival} stations={tiles.stations} />}
      <CityControls reducedMotion={reducedMotion} onLeave={onLeave} />
    </>
  );
}
