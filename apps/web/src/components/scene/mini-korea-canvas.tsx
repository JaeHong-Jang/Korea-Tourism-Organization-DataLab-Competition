// 시군구 경계와 해 테마를 React Three Fiber 전국 장면으로 연결한다.

import type { FestivalSummary } from "@crowdcast/contracts/types";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import type { Topology } from "topojson-specification";
import { useSelectionStore } from "../../lib/selection-store";
import { Board } from "./board";
import { CameraRig } from "./camera-rig";
import { FestivalLayer } from "./festival-layer";
import { buildLandModelForData, LandTiles } from "./land-tiles";
import { RoadTraffic } from "./motion/road-traffic";
import { Trains } from "./motion/trains";
import { WhaleBots } from "./motion/whale-bots";
import {
  qualityDpr,
  type SceneQuality,
  sceneColor,
  shiftQuality,
} from "./quality";
import { FrameSignal, QualityControl } from "./scene-diagnostics";
import { SunLight } from "./sun-light";
import { type SceneScale, useScene } from "./use-scene";

const EMPTY_TOTALS = new Map<string, number>();

// WebGL2가 없으면 로딩을 시작하지 않고 같은 자리에 안내한다.
function hasWebGl2(): boolean {
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}

// 잠든 탭과 움직임 줄이기 설정을 브라우저 변경 이벤트와 동기화한다.
function useScenePreferences() {
  const [visible, setVisible] = useState(!document.hidden);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onVisibility = () => setVisible(!document.hidden);
    const onMotion = () => setReducedMotion(query.matches);
    document.addEventListener("visibilitychange", onVisibility);
    query.addEventListener("change", onMotion);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      query.removeEventListener("change", onMotion);
    };
  }, []);
  return { visible, reducedMotion };
}

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
  const [topology, setTopology] = useState<Topology | null>(null);
  const [error, setError] = useState(false);
  const [quality, setQuality] = useState<SceneQuality>("high");
  const [regressFactor, setRegressFactor] = useState(1);
  const [showLand, setShowLand] = useState(true);
  const diagnostics = useMemo(() => {
    const search = new URLSearchParams(window.location.search);
    const measure = search.get("sceneMeasure") === "1";
    const debug = search.get("sceneDiagnostic") === "1";
    const value = search.get("sceneQuality");
    const fixedQuality: SceneQuality | null = measure
      ? "high"
      : value === "high" || value === "medium" || value === "low"
        ? (value as SceneQuality)
        : null;
    const focusCode = search.get("sceneFocus");
    return {
      measure,
      debug,
      fixedQuality,
      focusCode,
      motion: search.get("sceneMotion") !== "0",
    };
  }, []);
  const activeQuality = diagnostics.fixedQuality ?? quality;
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
  const { visible, reducedMotion } = useScenePreferences();
  const picked = useSelectionStore((state) => state.selectedSigunguCode);
  const selectedId = useSelectionStore((state) => state.selectedFestivalId);
  const selectFestival = useSelectionStore((state) => state.selectFestival);
  const selectSigungu = useSelectionStore((state) => state.selectSigungu);
  const setFilters = useSelectionStore((state) => state.setFilters);

  // 공개 경계 파일을 한 번 가져오고 중단된 요청은 상태를 바꾸지 않는다.
  useEffect(() => {
    if (!webgl) return;
    const controller = new AbortController();
    fetch("/geo/sigungu.topo.json", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`경계 파일 ${response.status}`);
        return response.json();
      })
      .then((data: Topology) => setTopology(data))
      .catch((reason) => {
        if (reason.name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, [webgl]);

  // 경계 파일을 시군구 타일·중심점·시도 대응표로 한 번만 바꾼다.
  const model = useMemo(
    () =>
      topology
        ? buildLandModelForData(topology, dataMode ? totals : null)
        : null,
    [topology, dataMode, totals],
  );

  // 경계가 교체되거나 페이지를 떠나면 병합 버퍼를 GPU에서 해제한다.
  useEffect(
    () => () => {
      model?.tiles.forEach((tile) => {
        tile.geometry.dispose();
      });
    },
    [model],
  );

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
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => gl.setClearColor(sceneColor("sky-day"))}
      >
        <QualityControl
          quality={activeQuality}
          fixed={diagnostics.fixedQuality !== null}
          diagnostic={diagnostics.debug}
          onQualityChange={(change) =>
            setQuality((current) => shiftQuality(current, change))
          }
          onRegressFactor={setRegressFactor}
        />
        <SunLight
          revision={scene.placed}
          quality={activeQuality}
          center={center}
          width={width}
          depth={depth}
        />
        <Board center={center} width={width} depth={depth} />
        {showLand && <LandTiles model={model} onPick={onPick} />}
        {diagnostics.motion && (
          <Trains
            reducedMotion={reducedMotion}
            diagnostic={diagnostics.debug}
          />
        )}
        {diagnostics.motion && (
          <RoadTraffic quality={activeQuality} reducedMotion={reducedMotion} />
        )}
        <FestivalLayer scene={scene} center={center} />
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
