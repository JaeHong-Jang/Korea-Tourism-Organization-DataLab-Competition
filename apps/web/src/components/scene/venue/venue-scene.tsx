// 실제 타일 지형과 행사 모형·인형·차량을 행사일 해 아래 한 장면으로 합친다.
import type { FestivalSummary, Weather } from "@crowdcast/contracts/types";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import { Fireworks } from "../effects/fireworks";
import { FestivalModels } from "../festival-models";
import type { PlacedFestival } from "../festival-models/placement";
import { type QualityMode, qualityDpr, type SceneQuality } from "../quality";
import { QualityControl } from "../scene-diagnostics";
import { readSceneOptions } from "../scene-options";
import { weatherEffects } from "../weather/state";
import { WeatherScene } from "../weather/weather-scene";
import { WetHighlights } from "../weather/wet-highlights";
import { VenueActors } from "./actors";
import { buildingCap, VenueBuildings } from "./buildings";
import { VenueDolls } from "./dolls";
import { VenueGround } from "./ground";
import { VenueNightLights } from "./night-lights";
import { graphRoutes, routeGraph } from "./routes";
import type { VenueEvent, VenueKey } from "./sites";
import type { VenueTiles } from "./tiles";
import { dollCount, venueDate, venueSun } from "./time";
import { VenueLight } from "./venue-light";
import { VenueSignal } from "./venue-signal";

// 견본과 예보서 모두 같은 행사 유형 모형과 등급 깃발을 사용한다.
function festivalPlacement(
  event: VenueEvent,
  level: number,
  peak: number,
): PlacedFestival[] {
  const festival: FestivalSummary = {
    eventId: "venue",
    forecastId: "venue",
    name: event.name,
    type: event.type,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    sigunguCode: "00000",
    sigunguName: event.venue.name,
    lat: event.venue.lat,
    lng: event.venue.lng,
    level,
    peakP10: peak,
    peakP50: peak,
    peakP90: peak,
    pOver1000: 0,
    ood: false,
  };
  return [{ festival, x: 0, y: 0, z: 0 }];
}

// 타일 입력은 고정하고 슬라이더 변화에 따라 조명·군중·차량 위상만 갱신한다.
export function VenueScene({
  tiles,
  event,
  siteKey,
  peak,
  profile,
  level,
  hour,
  reducedMotion,
  weather,
  qualityMode,
  quality,
  onQualityChange,
}: {
  tiles: VenueTiles;
  event: VenueEvent;
  siteKey: VenueKey;
  peak: number;
  profile: { hour: number; share: number }[];
  level: number;
  hour: number;
  reducedMotion: boolean;
  weather: Weather | null;
  qualityMode: QualityMode;
  quality: SceneQuality;
  onQualityChange: (step: -1 | 1) => void;
}) {
  const [regress, setRegress] = useState(1);
  const options = useMemo(readSceneOptions, []);
  const activeQuality = quality;
  const measure = options.measure;
  const t435 = options.t435;
  const roads = useMemo(
    () => graphRoutes(routeGraph(tiles.roads), 20),
    [tiles],
  );
  const rails = useMemo(() => graphRoutes(routeGraph(tiles.rails), 8), [tiles]);
  const placed = useMemo(
    () => festivalPlacement(event, level, peak),
    [event, level, peak],
  );
  const dolls = dollCount(peak, hour, profile, activeQuality);
  const sky = venueSun(event, hour).sky;
  const effects = weatherEffects(weather, activeQuality);
  const eventHour = Number(event.startsAt.slice(11, 13));
  const cars = roads.length
    ? activeQuality === "high"
      ? 80
      : activeQuality === "medium"
        ? 40
        : 20
    : 0;

  // 현재 시각과 키를 진단에 남겨 세 장소가 각각 자체 타일을 읽었는지 확인한다.
  useEffect(() => {
    document.documentElement.dataset.venueKey = siteKey;
    document.documentElement.dataset.venueTime = venueDate(
      event.startsAt,
      hour,
    ).toISOString();
    return () => {
      delete document.documentElement.dataset.venueKey;
      delete document.documentElement.dataset.venueTime;
    };
  }, [siteKey, event.startsAt, hour]);

  return (
    <Canvas
      className="venue-3d__canvas"
      camera={{ position: [850, 850, 850], fov: 42, near: 1, far: 6000 }}
      dpr={qualityDpr(activeQuality) * regress}
      shadows={activeQuality === "high"}
      frameloop="always"
    >
      <VenueLight event={event} hour={hour} quality={activeQuality} />
      <VenueGround tiles={tiles} wet={effects.wetGround} />
      {t435 && (
        <WeatherScene
          weather={weather}
          quality={activeQuality}
          reducedMotion={reducedMotion}
          center={[0, 0]}
          width={2400}
          depth={2400}
          surfaceY={0}
          night={sky === "night"}
        />
      )}
      {t435 && effects.wetGround && (
        <WetHighlights center={[0, 0]} y={1.35} radius={180} />
      )}
      <VenueBuildings
        buildings={tiles.buildings}
        stations={tiles.stations}
        quality={activeQuality}
        night={sky === "night"}
      />
      <group position={[0, -7, 0]}>
        <FestivalModels placed={placed} />
      </group>
      <VenueDolls
        count={dolls.count}
        reducedMotion={reducedMotion || !t435}
        rain={effects.precipitation === "rain"}
      />
      {t435 && sky !== "day" && <VenueNightLights quality={activeQuality} />}
      {t435 && sky === "night" && event.type.includes("불꽃") && (
        <Fireworks
          position={[0, 55, 0]}
          quality={activeQuality}
          reducedMotion={reducedMotion}
        />
      )}
      <VenueActors
        roadRoutes={roads}
        railRoutes={rails}
        quality={activeQuality}
        hour={hour}
        eventHour={eventHour}
        reducedMotion={reducedMotion}
      />
      <OrbitControls
        makeDefault
        target={[0, 0, 0]}
        minDistance={250}
        maxDistance={2400}
        maxPolarAngle={Math.PI / 2.1}
        enableDamping={!reducedMotion}
      />
      <QualityControl
        quality={activeQuality}
        fixed={qualityMode !== "auto"}
        diagnostic={options.debug || measure}
        onQualityChange={onQualityChange}
        onRegressFactor={setRegress}
      />
      <VenueSignal
        buildings={Math.min(tiles.buildings.length, buildingCap(activeQuality))}
        cars={cars}
        sky={sky}
        measure={measure}
        diagnostic={options.debug || measure}
      />
    </Canvas>
  );
}
