// 고른 행사 동네를 성남식 3D 미니어처로 펼친다 — 실제 건물·길·녹지·물 위에 사람·차 연출.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../../../lib/theme/theme-provider";
import { FestivalModels } from "../festival-models";
import type { SceneQuality } from "../quality";
import { SkyScene } from "../sky/sky-scene";
import {
  graphRoutes,
  pathRoute,
  routeGraph,
  towardShare,
} from "../venue/routes";
import { loadCityTiles, type VenueTiles } from "../venue/tiles";
import { CityBuildings, cityBuildingCap } from "./city-buildings";
import { CityControls } from "./city-controls";
import { CityGround } from "./city-ground";
import { CityLabels } from "./city-labels";
import { CITY_MOON, CityLight } from "./city-light";
import { CityPeople } from "./city-people";
import { CityTraffic } from "./city-traffic";
import { CityTrees } from "./city-trees";
import { fillBuildings } from "./fill-buildings";
import { buildingIndex } from "./free-space";
import { HomewardPath } from "./homeward-path";
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
  homeward = false,
}: {
  festival: FestivalSummary;
  quality: SceneQuality;
  reducedMotion: boolean;
  onLeave: () => void;
  onStatus?: (status: CityStatus) => void;
  // 귀가 인파 보기 — 행사장에서 가장 가까운 역까지 걷는 길과 행렬을 켠다.
  homeward?: boolean;
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

  // 찻길(보행로 제외)과 사람 길(큰길 제외)을 한 번씩 그래프로 만든다.
  const roadGraph = useMemo(
    () =>
      tiles
        ? routeGraph(tiles.roads.filter((line) => line.kind !== "path"))
        : null,
    [tiles],
  );
  const walkGraph = useMemo(
    () =>
      tiles
        ? routeGraph(tiles.roads.filter((line) => line.kind !== "major_road"))
        : null,
    [tiles],
  );
  // 동네 전체를 다니는 긴 경로와, 확대했을 때 보는 곳 근처에 세울 짧은 경로(300m 이하)를 따로 만든다.
  const roads = useMemo(
    () => (roadGraph ? graphRoutes(roadGraph, 64) : []),
    [roadGraph],
  );
  const nearbyRoads = useMemo(
    () => (roadGraph ? graphRoutes(roadGraph, 300, 300) : []),
    [roadGraph],
  );
  // 사람은 큰길 한가운데가 아니라 골목·보행로 가장자리를 걷는다.
  const walks = useMemo(
    () => (walkGraph ? graphRoutes(walkGraph, 64) : []),
    [walkGraph],
  );
  const nearbyWalks = useMemo(
    () => (walkGraph ? graphRoutes(walkGraph, 400, 300) : []),
    [walkGraph],
  );
  const rails = useMemo(
    () => (tiles ? graphRoutes(routeGraph(tiles.rails), 8) : []),
    [tiles],
  );
  // 1.2km 안 가까운 역부터 차례로, 큰길 인도까지 포함한 모든 길을 따라 걷는 최단 경로(이어지는 역이 없으면 그리지 않는다).
  const homeRoute = useMemo(() => {
    if (!tiles) return null;
    const graph = routeGraph(tiles.roads);
    const stations = [...tiles.stations]
      .filter(({ point }) => Math.hypot(...point) < 1200)
      .sort((a, b) => Math.hypot(...a.point) - Math.hypot(...b.point));
    for (const station of stations.slice(0, 4)) {
      const route = pathRoute(
        graph,
        [0, 0],
        station.point,
        `${station.name} 가는 길`,
      );
      if (route && route.length > 50) return route;
    }
    return null;
  }, [tiles]);
  useEffect(() => {
    document.documentElement.dataset.cityHomeward = homeRoute?.name ?? "none";
    return () => {
      delete document.documentElement.dataset.cityHomeward;
    };
  }, [homeRoute]);
  // 행사 무대 자리(원점 12m 안)를 덮는 건물만 빼 무대·모인 사람이 건물 속에 묻히지 않게 한다.
  // OSM 건물이 없는 길가는 품질 상한까지 연출 건물로 채우고, 가까운 건물부터 세우도록 거리순으로 둔다.
  const buildings = useMemo(() => {
    if (!tiles) return [];
    const stage = buildingIndex(tiles.buildings);
    const real = stage(0, 0, 12)
      ? tiles.buildings.filter(
          (building) => !buildingIndex([building])(0, 0, 12),
        )
      : tiles.buildings;
    const cap = cityBuildingCap(quality);
    return [
      ...real,
      ...fillBuildings(tiles, cap - Math.min(cap, real.length)),
    ].sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  }, [tiles, quality]);
  // 나무도 채운 건물 속에 심지 않게 같은 건물 목록을 준다.
  const planted = useMemo(
    () => (tiles ? { ...tiles, buildings } : null),
    [tiles, buildings],
  );
  const blocked = useMemo(
    () => (tiles ? buildingIndex(buildings) : undefined),
    [tiles, buildings],
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
        sunStrength={0.3}
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
          buildings={buildings}
          zones={tiles.zones ?? []}
          roads={tiles.roads}
          quality={quality}
          night={sky === "night"}
        />
      )}
      {planted && <CityTrees tiles={planted} quality={quality} />}
      <group position={[0, 2, 0]} scale={6}>
        <FestivalModels placed={placed} />
      </group>
      {tiles && (
        <CityPeople
          routes={walks.length ? walks : roads}
          nearby={nearbyWalks.length ? nearbyWalks : nearbyRoads}
          wide
          gather={gatheredDolls(festival.peakP50)}
          towardShare={towardShare(hour, eventHour)}
          quality={quality}
          reducedMotion={reducedMotion}
          blocked={blocked}
        />
      )}
      {homeward && homeRoute && (
        <>
          <HomewardPath route={homeRoute} />
          <CityPeople
            routes={[homeRoute]}
            walkers={quality === "high" ? 120 : quality === "medium" ? 70 : 30}
            gather={0}
            towardShare={0}
            quality={quality}
            reducedMotion={reducedMotion}
          />
        </>
      )}
      {tiles && (
        <CityTraffic
          roadRoutes={roads}
          nearbyRoads={nearbyRoads}
          wide
          railRoutes={rails}
          quality={quality}
          hour={hour}
          eventHour={eventHour}
          reducedMotion={reducedMotion}
        />
      )}
      {tiles && <CityLabels festival={festival} stations={tiles.stations} />}
      <CityControls reducedMotion={reducedMotion} onLeave={onLeave} />
    </>
  );
}
