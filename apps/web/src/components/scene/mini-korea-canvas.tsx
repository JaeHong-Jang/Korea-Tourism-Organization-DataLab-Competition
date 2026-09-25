// 시군구 경계와 해 테마를 React Three Fiber 전국 장면으로 연결한다.

import type { FestivalSummary } from "@crowdcast/contracts/types";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import { useSelectionStore } from "../../lib/selection-store";
import { useTheme } from "../../lib/theme/theme-provider";
import { Board } from "./board";
import { CameraRig } from "./camera-rig";
import { Fireworks } from "./effects/fireworks";
import { FestivalLayer } from "./festival-layer";
import { LandTiles } from "./land-tiles";
import { RoadTraffic } from "./motion/road-traffic";
import { Trains } from "./motion/trains";
import { WhaleBots } from "./motion/whale-bots";
import { ForecastOffice } from "./office/forecast-office";
import { qualityDpr, sceneColor } from "./quality";
import { nationalDescription } from "./scene-description";
import { FrameSignal, QualityControl } from "./scene-diagnostics";
import {
  hasWebGl2,
  readSceneOptions,
  useScenePreferences,
  useSceneQuality,
} from "./scene-options";
import { SkyScene } from "./sky/sky-scene";
import { SunLight } from "./sun-light";
import { useLandModel } from "./use-land-model";
import { type SceneScale, useScene } from "./use-scene";
import { weatherEffects } from "./weather/state";
import { useSceneWeather } from "./weather/use-scene-weather";
import { WeatherScene } from "./weather/weather-scene";
import { WetHighlights } from "./weather/wet-highlights";

const EMPTY_TOTALS = new Map<string, number>();

// 경계 로딩과 실패를 분리하고 선택 코드를 시도 필터에 연결한다.
export function MiniKoreaCanvas({
  festivals = [],
  onScaleChange,
  dataMode = false,
  totals = EMPTY_TOTALS,
  overviewRevision = 0,
}: {
  festivals?: FestivalSummary[];
  onScaleChange?: (scale: SceneScale) => void;
  dataMode?: boolean;
  totals?: Map<string, number>;
  overviewRevision?: number;
}) {
  const [regressFactor, setRegressFactor] = useState(1);
  const [showLand, setShowLand] = useState(true);
  const diagnostics = useMemo(readSceneOptions, []);
  const { mode, quality: activeQuality, change } = useSceneQuality(diagnostics);
  const t435 = diagnostics.t435;
  const scene = useScene(
    festivals,
    activeQuality,
    onScaleChange,
    dataMode ? totals : null,
  );

  // 명시적 진단 모드에서만 타일 재마운트를 허용해 GPU 해제량을 확인한다.
  useEffect(() => {
    if (!diagnostics.debug) return;
    window.__crowdcastToggleLand = setShowLand;
    return () => {
      delete window.__crowdcastToggleLand;
    };
  }, [diagnostics.debug]);
  const [webgl] = useState(hasWebGl2);
  const { model, error } = useLandModel(webgl, dataMode, totals);
  const { visible, reducedMotion } = useScenePreferences();
  const picked = useSelectionStore((state) => state.selectedSigunguCode);
  const selectedId = useSelectionStore((state) => state.selectedFestivalId);
  const { at, sky } = useTheme();
  const weather = useSceneWeather(festivals, selectedId, at);
  const selectFestival = useSelectionStore((state) => state.selectFestival);
  const selectSigungu = useSelectionStore((state) => state.selectSigungu);
  const setFilters = useSelectionStore((state) => state.setFilters);

  // 나무판과 조명 범위는 땅 경계에 여백 90km를 더한 크기로 맞춘다.
  const bounds = model?.bounds;
  const center: [number, number] = bounds
    ? [(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2]
    : [0, 0];
  const focusPoint = useMemo(() => {
    const selectedEvent = scene.placed.find(
      ({ festival }) => festival.eventId === selectedId,
    );
    if (selectedEvent)
      return [selectedEvent.x, selectedEvent.z] as [number, number];
    if (!diagnostics.focusCode) return null;
    const event = scene.placed.find(
      ({ festival }) => festival.sigunguCode === diagnostics.focusCode,
    );
    return event
      ? ([event.x, event.z] as [number, number])
      : (model?.centers.get(diagnostics.focusCode) ?? null);
  }, [selectedId, diagnostics.focusCode, scene.placed, model]);
  const width = bounds ? bounds.maxX - bounds.minX + 90 : 600;
  const depth = bounds ? bounds.maxZ - bounds.minZ + 90 : 900;

  // 시군구 선택을 저장하고 기존 시도 필터와 카메라 이동을 함께 유지한다.
  const onPick = (code: string) => {
    selectFestival(null);
    selectSigungu(code);
    const sido = model?.sidoByCode.get(code);
    if (sido) setFilters({ sido });
  };

  if (!webgl)
    return <p role="status">3D를 쓸 수 없는 환경이에요 — 목록으로 보기</p>;
  if (error)
    return (
      <p role="alert">지도를 불러오지 못했어요. 목록에서 행사를 살펴보세요.</p>
    );
  if (!model)
    return <p role="status">미니 대한민국 지도를 불러오는 중이에요.</p>;
  if (model.tiles.length === 0)
    return (
      <p role="status">
        표시할 시군구 경계가 없어요. 목록에서 행사를 살펴보세요.
      </p>
    );

  return (
    <section
      style={{ position: "absolute", inset: 0 }}
      aria-label="시군구를 선택할 수 있는 3D 미니 대한민국"
      data-focus-id={selectedId ?? ""}
    >
      <p className="sr-only" aria-live="polite">
        {nationalDescription(
          scene.placed.map(({ festival }) => festival),
          selectedId,
        )}
      </p>
      <Canvas
        onPointerMissed={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest(".scene-name-tag")
          )
            return;
          selectFestival(null);
          selectSigungu(null);
        }}
        shadows={activeQuality === "high"}
        dpr={qualityDpr(activeQuality) * regressFactor}
        frameloop={visible ? "always" : "never"}
        camera={{
          position: [center[0] + 430, 590, center[1] + 810],
          fov: 44,
          near: 10,
          far: 5000,
        }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => gl.setClearColor(sceneColor("sky-day"))}
      >
        <QualityControl
          quality={activeQuality}
          fixed={mode !== "auto"}
          diagnostic={diagnostics.debug}
          onQualityChange={change}
          onRegressFactor={setRegressFactor}
        />
        <SunLight
          revision={scene.placed}
          quality={activeQuality}
          center={center}
          width={width}
          depth={depth}
        />
        {diagnostics.sky && (
          <SkyScene
            center={center}
            quality={activeQuality}
            reducedMotion={reducedMotion}
          />
        )}
        <Board center={center} width={width} depth={depth} />
        {t435 && (
          <WeatherScene
            weather={weather}
            quality={activeQuality}
            reducedMotion={reducedMotion}
            center={center}
            width={width}
            depth={depth}
            surfaceY={9.5}
            night={sky === "night"}
          />
        )}
        {t435 &&
          weatherEffects(weather, activeQuality).wetGround &&
          scene.placed[0] && (
            <WetHighlights
              center={[scene.placed[0].x, scene.placed[0].z]}
              y={11}
              radius={13}
              count={8}
            />
          )}
        {t435 && (
          <ForecastOffice
            x={center[0] - width / 2 + 38}
            z={center[1] - depth / 2 + 38}
          />
        )}
        {showLand && <LandTiles model={model} onPick={onPick} />}
        {diagnostics.motion && !dataMode && (
          <Trains
            reducedMotion={reducedMotion}
            diagnostic={diagnostics.debug}
          />
        )}
        {diagnostics.motion && !dataMode && (
          <RoadTraffic quality={activeQuality} reducedMotion={reducedMotion} />
        )}
        <FestivalLayer
          scene={scene}
          center={center}
          reducedMotion={reducedMotion || !t435}
        />
        {t435 &&
          sky === "night" &&
          scene.placed
            .filter(({ festival }) => festival.type.includes("불꽃"))
            .slice(0, 3)
            .map(({ festival, x, y, z }) => (
              <Fireworks
                key={festival.eventId}
                position={[x, y + 36, z]}
                quality={activeQuality}
                reducedMotion={reducedMotion}
              />
            ))}
        {diagnostics.motion && (
          <WhaleBots
            selected={
              scene.placed.find(
                ({ festival }) => festival.eventId === selectedId,
              ) ?? null
            }
            quality={activeQuality}
            reducedMotion={reducedMotion}
            diagnostic={diagnostics.debug}
          />
        )}
        <CameraRig
          center={center}
          selected={
            focusPoint ?? (picked ? (model.centers.get(picked) ?? null) : null)
          }
          reducedMotion={reducedMotion}
          focus={Boolean(diagnostics.focusCode || selectedId)}
          width={width}
          depth={depth}
          overviewRevision={overviewRevision}
        />
        <FrameSignal
          measure={diagnostics.measure}
          diagnostic={diagnostics.debug}
        />
      </Canvas>
    </section>
  );
}
