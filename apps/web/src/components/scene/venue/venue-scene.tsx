// 실제 타일 지형과 행사 모형·인형·차량을 행사일 해 아래 한 장면으로 합친다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { FestivalModels } from "../festival-models";
import type { PlacedFestival } from "../festival-models/placement";
import {
  qualityDpr,
  type SceneQuality,
  sceneColor,
  shiftQuality,
} from "../quality";
import { FrameSignal, QualityControl } from "../scene-diagnostics";
import { VenueActors } from "./actors";
import { VenueBuildings } from "./buildings";
import { VenueDolls } from "./dolls";
import { VenueGround } from "./ground";
import { graphRoutes, routeGraph } from "./routes";
import type { VenueEvent, VenueKey } from "./sites";
import type { VenueTiles } from "./tiles";
import { dollCount, venueDate, venueSun } from "./time";

// 프레임 진단은 견본 e2e와 성능 측정에서만 DOM에 숫자를 기록한다.
function VenueSignal({
  buildings,
  cars,
  sky,
  measure,
}: {
  buildings: number;
  cars: number;
  sky: string;
  measure: boolean;
}) {
  const ready = useRef(false);
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    document.documentElement.dataset.venueBuildings = String(buildings);
    document.documentElement.dataset.venueCars = String(cars);
    document.documentElement.dataset.venueSky = sky;
    window.__crowdcastVenueRender = () => ({
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
    });
    return () => {
      delete document.documentElement.dataset.venueBuildings;
      delete document.documentElement.dataset.venueCars;
      delete document.documentElement.dataset.venueSky;
      delete window.__crowdcastVenueRender;
    };
  }, [buildings, cars, sky, gl]);
  useEffect(
    () => () => {
      delete document.documentElement.dataset.venueReady;
    },
    [],
  );
  useFrame(() => {
    if (!ready.current) {
      document.documentElement.dataset.venueReady = "true";
      ready.current = true;
    }
  });
  return <FrameSignal measure={measure} diagnostic={measure} />;
}

// 해 고도와 방위를 행사 장소에 적용하고 밤에 창문과 역 조명을 켠다.
function VenueLight({
  event,
  hour,
  quality,
}: {
  event: VenueEvent;
  hour: number;
  quality: SceneQuality;
}) {
  const sun = venueSun(event, hour);
  const night = sun.sky === "night";
  const dusk = sun.sky === "dusk";
  const elevation = night ? 0.2 : Math.max(0.1, Math.sin(sun.altitude));
  const position: [number, number, number] = [
    -Math.sin(sun.azimuth) * 900,
    elevation * 900,
    Math.cos(sun.azimuth) * 900,
  ];
  return (
    <>
      <color attach="background" args={[sceneColor(`sky-${sun.sky}`)]} />
      <hemisphereLight
        color={sceneColor(`sky-${sun.sky}`)}
        groundColor={sceneColor("board-side")}
        intensity={night ? 0.65 : dusk ? 1 : 1.3}
      />
      <directionalLight
        position={position}
        color={dusk ? sceneColor("window-glow") : sceneColor("sky-day")}
        intensity={night ? 0.5 : dusk ? 1.2 : 1.7}
        castShadow={quality === "high" && !night}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-1250}
        shadow-camera-right={1250}
        shadow-camera-top={1250}
        shadow-camera-bottom={-1250}
      />
      {night && (
        <pointLight
          position={[0, 35, 0]}
          color={sceneColor("window-glow")}
          intensity={2000}
          distance={260}
        />
      )}
    </>
  );
}

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
}: {
  tiles: VenueTiles;
  event: VenueEvent;
  siteKey: VenueKey;
  peak: number;
  profile: { hour: number; share: number }[];
  level: number;
  hour: number;
  reducedMotion: boolean;
}) {
  const [quality, setQuality] = useState<SceneQuality>("high");
  const [regress, setRegress] = useState(1);
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const measure = params.get("sceneMeasure") === "1";
  const fixed =
    measure ||
    params.get("sceneQuality") === "high" ||
    params.get("sceneQuality") === "medium" ||
    params.get("sceneQuality") === "low";
  const activeQuality = measure
    ? "high"
    : fixed
      ? (params.get("sceneQuality") as SceneQuality)
      : quality;
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
      <VenueGround tiles={tiles} />
      <VenueBuildings
        buildings={tiles.buildings}
        stations={tiles.stations}
        quality={activeQuality}
        night={sky === "night"}
      />
      <group position={[0, -7, 0]}>
        <FestivalModels placed={placed} />
      </group>
      <VenueDolls count={dolls.count} />
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
        fixed={fixed}
        diagnostic={measure}
        onQualityChange={(change) =>
          setQuality((current) => shiftQuality(current, change))
        }
        onRegressFactor={setRegress}
      />
      <VenueSignal
        buildings={Math.min(
          tiles.buildings.length,
          activeQuality === "high"
            ? 2400
            : activeQuality === "medium"
              ? 1200
              : 600,
        )}
        cars={cars}
        sky={sky}
        measure={measure}
      />
    </Canvas>
  );
}

declare global {
  interface Window {
    __crowdcastVenueRender?: () => { calls: number; triangles: number };
    __crowdcastVenueVehicle?: () => number[];
  }
}
