// WebGL 가능 여부와 진단 URL·모션 선호를 장면 밖에서 읽는다.
import { useCallback, useEffect, useState } from "react";
import {
  type QualityMode,
  recommendedQuality,
  type SceneQuality,
  shiftQuality,
} from "./quality";

// WebGL2가 없으면 로딩을 시작하지 않고 같은 자리에 안내한다.
export function hasWebGl2(): boolean {
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}

// 잠든 탭과 움직임 줄이기 설정을 브라우저 변경 이벤트와 동기화한다.
export function useScenePreferences() {
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

// 성능 계측 URL만 품질을 고정하고 일반 화면은 자동 감지를 유지한다.
export function readSceneOptions() {
  const search = new URLSearchParams(window.location.search);
  const measure = search.get("sceneMeasure") === "1";
  const value = search.get("sceneQuality");
  const fixedQuality: SceneQuality | null =
    value === "high" || value === "medium" || value === "low"
      ? value
      : measure
        ? "high"
        : null;
  return {
    measure,
    debug: search.get("sceneDiagnostic") === "1",
    fixedQuality,
    focusCode: search.get("sceneFocus"),
    motion: search.get("sceneMotion") !== "0",
    t435: search.get("sceneT435") !== "0",
    // 성능 비교용: sceneSky=0이면 하늘 공·별·달·햇빛을 끈다.
    sky: search.get("sceneSky") !== "0",
    // 행사를 고르면 동네 3D로 들어간다 — sceneCity=0이면 전국 판 진단만 한다.
    city: search.get("sceneCity") !== "0",
  };
}

// URL 고정값 또는 사용자 선택을 우선하고 자동 모드만 프레임 신호로 바꾼다.
export function useSceneQuality(options: ReturnType<typeof readSceneOptions>) {
  const [mode, setMode] = useState<QualityMode>(options.fixedQuality ?? "auto");
  const [hardwarePreset] = useState<SceneQuality>(() =>
    recommendedQuality(
      navigator.hardwareConcurrency,
      (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    ),
  );
  const [automatic, setAutomatic] = useState<SceneQuality>(hardwarePreset);
  const quality = mode === "auto" ? automatic : mode;
  const change = useCallback(
    (step: -1 | 1) =>
      setAutomatic((current) =>
        hardwarePreset === "low" && step === 1
          ? current
          : shiftQuality(current, step),
      ),
    [hardwarePreset],
  );
  return { mode, setMode, quality, change };
}
