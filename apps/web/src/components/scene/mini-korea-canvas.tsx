// 시군구 경계와 해 테마를 React Three Fiber 전국 장면으로 연결한다.
import { PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Topology } from "topojson-specification";
import { useSelectionStore } from "../../lib/selection-store";
import { Board } from "./board";
import { CameraRig } from "./camera-rig";
import { HonestNote } from "./honest-note";
import { buildLandModel, LandTiles } from "./land-tiles";
import {
  qualityDpr,
  type SceneQuality,
  sceneColor,
  shiftQuality,
} from "./quality";
import { SunLight } from "./sun-light";

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

// 프레임 저하를 품질 단계와 R3F 회귀 계수로 알리고, DPR은 Canvas prop 한 곳에서만 정한다.
function QualityControl({
  quality,
  fixed,
  diagnostic,
  onQualityChange,
  onRegressFactor,
}: {
  quality: SceneQuality;
  fixed: boolean;
  diagnostic: boolean;
  onQualityChange: (change: -1 | 1) => void;
  onRegressFactor: (factor: number) => void;
}) {
  const performance = useThree((state) => state.performance);
  const current = useThree((state) => state.performance.current);

  // R3F가 재렌더마다 Canvas dpr prop을 다시 적용하므로 회귀 계수는 prop 쪽으로 올려 보낸다.
  useEffect(() => {
    onRegressFactor(current);
  }, [current, onRegressFactor]);

  // 현재 품질 단계를 문서에 표시해 테스트·측정이 읽게 한다.
  useEffect(() => {
    document.documentElement.dataset.sceneQuality = quality;
    return () => {
      delete document.documentElement.dataset.sceneQuality;
    };
  }, [quality]);

  // 진단 모드에서 회귀 신호가 실제 DPR까지 전달되는지 검사한다.
  useEffect(() => {
    if (!diagnostic) return;
    window.__crowdcastRegress = () => performance.regress();
    return () => {
      delete window.__crowdcastRegress;
    };
  }, [diagnostic, performance]);

  return (
    <>
      {!fixed && (
        <PerformanceMonitor
          onDecline={() => {
            performance.regress();
            onQualityChange(-1);
          }}
          onIncline={() => onQualityChange(1)}
        />
      )}
    </>
  );
}

// 첫 렌더를 표시하고 명시적인 측정 모드에서만 숫자 버퍼에 프레임을 쌓는다.
function FrameSignal({
  measure,
  diagnostic,
}: {
  measure: boolean;
  diagnostic: boolean;
}) {
  const ready = useRef(false);
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    if (measure) window.__crowdcastSceneFrames = [];
    if (diagnostic)
      window.__crowdcastSceneMemory = () => ({ ...gl.info.memory });
    return () => {
      delete document.documentElement.dataset.sceneReady;
      delete window.__crowdcastSceneFrames;
      delete window.__crowdcastSceneMemory;
    };
  }, [diagnostic, gl, measure]);
  useFrame((_, delta) => {
    if (!ready.current) {
      document.documentElement.dataset.sceneReady = "true";
      ready.current = true;
    }
    if (measure) window.__crowdcastSceneFrames?.push(delta * 1000);
  });
  return null;
}

declare global {
  interface Window {
    __crowdcastSceneFrames?: number[];
    __crowdcastSceneMemory?: () => { geometries: number; textures: number };
    __crowdcastToggleLand?: (visible: boolean) => void;
    __crowdcastRegress?: () => void;
  }
}

// 경계 로딩과 실패를 분리하고 선택 코드를 시도 필터에 연결한다.
export function MiniKoreaCanvas() {
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
    return { measure, debug, fixedQuality };
  }, []);
  const activeQuality = diagnostics.fixedQuality ?? quality;

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
    () => (topology ? buildLandModel(topology) : null),
    [topology],
  );

  // 경계가 교체되거나 페이지를 떠나면 병합 버퍼를 GPU에서 해제한다.
  useEffect(
    () => () => {
      model?.tiles.forEach((tile) => {
        tile.geometry.dispose();
      });
      delete document.documentElement.dataset.sceneReady;
    },
    [model],
  );

  // 나무판과 조명 범위는 땅 경계에 여백 90km를 더한 크기로 맞춘다.
  const bounds = model?.bounds;
  const center: [number, number] = bounds
    ? [(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2]
    : [0, 0];
  const width = bounds ? bounds.maxX - bounds.minX + 90 : 600;
  const depth = bounds ? bounds.maxZ - bounds.minZ + 90 : 900;

  // 시군구 선택을 저장하고 기존 시도 필터와 카메라 이동을 함께 유지한다.
  const onPick = (code: string) => {
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
    <>
      <section
        style={{ position: "absolute", inset: 0 }}
        aria-label="시군구를 선택할 수 있는 3D 미니 대한민국"
      >
        <Canvas
          shadows={activeQuality === "high"}
          dpr={qualityDpr(activeQuality) * regressFactor}
          frameloop={visible ? "always" : "never"}
          camera={{
            position: [center[0] + 440, 650, center[1] + 920],
            fov: 44,
            near: 10,
            far: 2600,
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
            quality={activeQuality}
            center={center}
            width={width}
            depth={depth}
          />
          <Board center={center} width={width} depth={depth} />
          {showLand && <LandTiles model={model} onPick={onPick} />}
          <CameraRig
            center={center}
            selected={picked ? (model.centers.get(picked) ?? null) : null}
            reducedMotion={reducedMotion}
          />
          <FrameSignal
            measure={diagnostics.measure}
            diagnostic={diagnostics.debug}
          />
        </Canvas>
      </section>
      <HonestNote />
    </>
  );
}
