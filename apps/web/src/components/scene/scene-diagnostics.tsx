// 장면 품질 회귀와 프레임 진단 값을 Canvas 내부에서 수집한다.
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef } from "react";
import {
  type QualityWindow,
  type SceneQuality,
  sampleQuality,
} from "./quality";

// 프레임 저하를 품질 단계와 R3F 회귀 계수로 알리고, DPR은 Canvas prop 한 곳에서만 정한다.
export function QualityControl({
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
  const qualityWindow = useRef<QualityWindow>({
    frames: 0,
    elapsed: 0,
    slow: 0,
    fast: 0,
    cooldownUntil: 0,
    recovered: false,
  });
  const injected = useRef(false);
  const minimum = useThree((state) => state.performance.min);
  const restore = useRef<number | undefined>(undefined);
  // 회귀는 해상도 계수를 곧바로 낮추고 1.5초 뒤 되돌린다 — 한 프레임이 R3F 복귀 시간(200ms)보다 길어도
  // performance.current의 짧은 하강을 React가 놓쳐 해상도가 안 낮아지는 일이 없게 한다.
  const lower = useCallback(() => {
    performance.regress();
    onRegressFactor(minimum);
    window.clearTimeout(restore.current);
    restore.current = window.setTimeout(() => onRegressFactor(1), 1500);
  }, [performance, minimum, onRegressFactor]);
  useEffect(() => () => window.clearTimeout(restore.current), []);

  // 실제 프레임과 진단 입력 모두 같은 히스테리시스 판정을 거친다.
  const sample = useCallback(
    (frameMs: number, nowMs: number) => {
      if (fixed) return;
      const step = sampleQuality(qualityWindow.current, frameMs, nowMs);
      if (step === -1) lower();
      if (step !== 0) onQualityChange(step);
    },
    [fixed, lower, onQualityChange],
  );
  useFrame((state, delta) => {
    if (!injected.current)
      sample(Math.min(delta * 1000, 250), state.clock.elapsedTime * 1000);
  });

  // R3F가 재렌더마다 Canvas dpr prop을 다시 적용하므로 회귀 계수는 prop 쪽으로 올려 보낸다.
  // 낮춘 해상도는 1.5초 유지한 뒤 되돌린다 — R3F 기본 200ms 안에 복귀하면 무거운 장면 재렌더와
  // 겹쳐 낮춘 값이 반영되지 못하고, 해상도가 오르내리며 깜박이지도 않게 한다.
  useEffect(() => {
    if (current < 1) {
      onRegressFactor(current);
      return;
    }
    const timer = window.setTimeout(() => onRegressFactor(current), 1500);
    return () => window.clearTimeout(timer);
  }, [current, onRegressFactor]);

  // 현재 품질 단계를 문서에 표시해 테스트·측정이 읽게 한다.
  useEffect(() => {
    document.documentElement.dataset.sceneQuality = quality;
    document.documentElement.dataset.sceneEffects =
      quality === "high" ? "on" : "off";
    return () => {
      delete document.documentElement.dataset.sceneQuality;
      delete document.documentElement.dataset.sceneEffects;
    };
  }, [quality]);

  // 진단 모드에서 회귀 신호가 실제 DPR까지 전달되는지 검사한다.
  useEffect(() => {
    if (!diagnostic) return;
    window.__crowdcastRegress = lower;
    window.__crowdcastFeedFrame = (frameMs: number, frames: number) => {
      injected.current = true;
      let now = Math.max(
        globalThis.performance.now(),
        qualityWindow.current.cooldownUntil,
      );
      for (let index = 0; index < frames; index++) {
        now += frameMs;
        sample(frameMs, now);
      }
    };
    return () => {
      delete window.__crowdcastRegress;
      delete window.__crowdcastFeedFrame;
    };
  }, [diagnostic, lower, sample]);

  return null;
}

// 첫 렌더를 표시하고 명시적인 측정 모드에서만 숫자 버퍼에 프레임을 쌓는다.
export function FrameSignal({
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
    if (diagnostic) {
      window.__crowdcastSceneMemory = () => ({ ...gl.info.memory });
      window.__crowdcastSceneRender = () => ({
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
      });
    }
    return () => {
      delete document.documentElement.dataset.sceneReady;
      delete window.__crowdcastSceneFrames;
      delete window.__crowdcastSceneMemory;
      delete window.__crowdcastSceneRender;
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
    __crowdcastFeedFrame?: (frameMs: number, frames: number) => void;
    __crowdcastSceneRender?: () => { calls: number; triangles: number };
  }
}
