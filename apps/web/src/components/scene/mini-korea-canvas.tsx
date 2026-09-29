// 성남 방식의 실제 전국 지도를 받침판 없이 하나의 캔버스에서 확대·이동한다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { Canvas } from "@react-three/fiber";
import "./scene-theme.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelectionStore } from "../../lib/selection-store";
import { useTheme } from "../../lib/theme/theme-provider";
import { DataBorders } from "./data-borders";
import { LandTiles } from "./land-tiles";
import {
  groupFestivalPins,
  MapFestivalPins,
} from "./national-map/festival-pins";
import { NationalMapLayer } from "./national-map/map-layer";
import { NationalCamera } from "./national-map/national-camera";
import { MapPinPositions } from "./national-map/pin-positions";
import { RegionBoundaries } from "./national-map/region-boundaries";
import { FestivalGroundRings } from "./national-map/festival-ground-rings";
import type {
  MapCommand,
  MapStatus,
  MapViewport,
  NavigationMode,
} from "./national-map/types";
import { projectKorea } from "./projection";
import { qualityDpr, sceneColor } from "./quality";
import { FrameSignal, QualityControl } from "./scene-diagnostics";
import {
  hasWebGl2,
  readSceneOptions,
  useScenePreferences,
  useSceneQuality,
} from "./scene-options";
import { useLandModel } from "./use-land-model";
import { type SceneScale, useScene } from "./use-scene";

const EMPTY_TOTALS = new Map<string, number>();
const INITIAL_COMMAND: MapCommand = { id: 0, kind: "overview" };

// 예보 선택·지역 경계·지도 로딩 상태를 같은 화면에 연결하고 장면을 교체하지 않는다.
export function MiniKoreaCanvas({
  festivals = [],
  onScaleChange,
  dataMode = false,
  totals = EMPTY_TOTALS,
  command = INITIAL_COMMAND,
  navigationMode = "pan",
  onMapStatus,
}: {
  festivals?: FestivalSummary[];
  onScaleChange?: (scale: SceneScale) => void;
  dataMode?: boolean;
  totals?: Map<string, number>;
  command?: MapCommand;
  navigationMode?: NavigationMode;
  onMapStatus?: (status: MapStatus) => void;
}) {
  const [regressFactor, setRegressFactor] = useState(1);
  const [showLand, setShowLand] = useState(true);
  const [groundReady, setGroundReady] = useState(false);
  const [view, setView] = useState<MapViewport | null>(null);
  const [mapStatus, setMapStatus] = useState<MapStatus | null>(null);
  const [navigating, setNavigating] = useState(false);
  const elements = useRef(new Map<string, HTMLButtonElement>());
  const diagnostics = useMemo(readSceneOptions, []);
  const { mode, quality, change } = useSceneQuality(diagnostics);
  const scene = useScene(festivals, quality, onScaleChange, null);
  const [webgl] = useState(hasWebGl2);
  const { model, error, terrainError } = useLandModel(webgl, false, totals, true);
  const { visible, reducedMotion } = useScenePreferences();
  const still = reducedMotion || !diagnostics.motion;
  const selectedId = useSelectionStore((state) => state.selectedFestivalId);
  const selectFestival = useSelectionStore((state) => state.selectFestival);
  const { sky } = useTheme();
  const bounds = model?.bounds;
  const center = useMemo<[number, number]>(
    () =>
      bounds
        ? [(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2]
        : [0, 0],
    [bounds],
  );
  const selected = useMemo<[number, number] | null>(() => {
    const festival = festivals.find((item) => item.eventId === selectedId);
    return festival ? projectKorea(festival.lng, festival.lat) : null;
  }, [festivals, selectedId]);
  const pins = useMemo(
    () => groupFestivalPins(festivals, selectedId, view, window.innerWidth),
    [festivals, selectedId, view],
  );

  // 로딩 안내는 도구 패널 대신 지도 아래 작은 상태 문구로 표시한다.
  const reportStatus = useCallback(
    (status: MapStatus) => {
      setMapStatus(status);
      onMapStatus?.(status);
    },
    [onMapStatus],
  );

  // 진단용 지면 토글을 유지하되 일반 화면에는 정사각 받침을 생성하지 않는다.
  useEffect(() => {
    if (!diagnostics.debug) return;
    window.__crowdcastToggleLand = setShowLand;
    return () => {
      delete window.__crowdcastToggleLand;
    };
  }, [diagnostics.debug]);
  useEffect(() => {
    document.documentElement.dataset.sceneSky = sky;
  }, [sky]);

  if (!webgl)
    return <p role="status">3D를 쓸 수 없는 환경이에요 — 목록으로 보기</p>;
  if (error)
    return (
      <p role="alert">지도를 불러오지 못했어요. 목록에서 행사를 살펴보세요.</p>
    );
  if (!model)
    return <p role="status">미니 대한민국 지도를 불러오는 중이에요.</p>;
  if (!model.tiles.length)
    return (
      <p role="status">
        표시할 시군구 경계가 없어요. 목록에서 행사를 살펴보세요.
      </p>
    );
  return (
    <section
      style={{ position: "absolute", inset: 0 }}
      aria-label="실제 지도를 확대할 수 있는 3D 미니 대한민국"
      data-focus-id={selectedId ?? ""}
      data-map-mode="continuous"
      data-map-base="no-board"
    >
      <Canvas
        orthographic
        dpr={Math.max(1, qualityDpr(quality) * regressFactor)}
        frameloop={!visible ? "never" : "demand"}
        camera={{
          position: [center[0] + 430, 809.5, center[1] + 550],
          near: 0.1,
          far: 5000,
          zoom: 1,
        }}
        gl={{
          antialias: true,
          alpha: false,
          stencil: true,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => {
          gl.setClearColor(sceneColor("sea"));
          gl.toneMappingExposure = 1.08;
        }}
      >
        <color
          attach="background"
          args={[sceneColor(sky === "night" ? "sky-night-low" : "sea")]}
        />
        <hemisphereLight
          intensity={sky === "night" ? 0.65 : 1.25}
          color="#f4faff"
          groundColor="#b8c7d4"
        />
        <directionalLight
          position={[center[0] - 350, 1300, center[1] + 600]}
          intensity={sky === "night" ? 0.65 : 1.65}
        />
        <QualityControl
          quality={quality}
          fixed={mode !== "auto"}
          diagnostic={diagnostics.debug}
          onQualityChange={change}
          onRegressFactor={setRegressFactor}
        />
        {showLand && (
          <LandTiles model={model} onPick={() => {}} interactive={false} depthWrite={!groundReady} />
        )}
        {showLand && (
          <NationalMapLayer
            festival={festivals.find(festival=>festival.eventId===selectedId)}
            onGroundReady={setGroundReady}
            view={view}
            model={model}
            quality={quality}
            onStatus={reportStatus}
            selected={selected}
            count={
              scene.scale.counts[
                scene.placed.findIndex(
                  ({ festival }) => festival.eventId === selectedId,
                )
              ] ?? 0
            }
            reducedMotion={still}
            navigating={navigating}
          />
        )}
        {dataMode && showLand && (
          <DataBorders anchors={model.anchors} totals={totals} />
        )}
        <MapPinPositions pins={pins} elements={elements} elevation={model.elevation} />
        {showLand && <FestivalGroundRings festivals={festivals} selectedId={selectedId} width={view?.width ?? 1000} elevation={model.elevation} night={sky === "night"} onPick={selectFestival} />}
        {showLand && !dataMode && <RegionBoundaries model={model} width={view?.width ?? 1000} night={sky === "night"} />}
        <NationalCamera
          elevation={model.elevation}
          center={center}
          width={bounds ? bounds.maxX - bounds.minX + 30 : 600}
          depth={bounds ? bounds.maxZ - bounds.minZ + 30 : 900}
          selected={selected}
          command={command}
          mode={navigationMode}
          reducedMotion={still}
          diagnostic={diagnostics.debug}
          onView={setView}
          onNavigation={setNavigating}
        />
        <FrameSignal
          measure={diagnostics.measure}
          diagnostic={diagnostics.debug}
        />
      </Canvas>
      <MapFestivalPins
        pins={pins}
        selectedId={selectedId}
        elements={elements}
        onPick={selectFestival}
      />
      <div className="scene-terrain-credit">
        {terrainError ? "고도 자료 연결 실패 · 평면 지도 표시" : "실제 고도 기반 · 높이 1.6배 강조 · 약 500m 격자"}
        {" · "}<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer">지형: Mapzen / USGS / NOAA</a>
      </div>
      {mapStatus && mapStatus.state !== "ready" && (
        <span className="scene-map-status" role="status" aria-live="polite">
          {mapStatus.state === "loading"
            ? "지도 불러오는 중…"
            : mapStatus.state === "error"
              ? "이 지역 지도를 불러오지 못했어요. 이동하면 다시 시도해요."
              : "이 범위에는 저장된 상세 지도 자료가 없어요."}
        </span>
      )}
    </section>
  );
}
