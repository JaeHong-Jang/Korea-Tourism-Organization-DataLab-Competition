// 행사 목록을 모형 위치와 품질별 군중 축척으로 바꾼다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { useEffect, useMemo } from "react";
import { crowdScale } from "./crowd-scale";
import { placeFestivals } from "./festival-models/placement";
import type { SceneQuality } from "./quality";

export type SceneScale = ReturnType<typeof crowdScale>;

// 목록 전체가 같은 인원 축척을 공유하고 진단 수치를 문서에 기록한다.
export function useScene(
  festivals: FestivalSummary[],
  quality: SceneQuality,
  onScaleChange?: (scale: SceneScale) => void,
) {
  const placed = useMemo(() => placeFestivals(festivals), [festivals]);
  const scale = useMemo(
    () =>
      crowdScale(
        placed.map(({ festival }) => festival),
        quality,
      ),
    [placed, quality],
  );
  useEffect(() => {
    document.documentElement.dataset.sceneDollCount = String(scale.total);
    document.documentElement.dataset.scenePeoplePerDoll = String(
      scale.peoplePerDoll,
    );
    onScaleChange?.(scale);
    return () => {
      delete document.documentElement.dataset.sceneDollCount;
      delete document.documentElement.dataset.scenePeoplePerDoll;
    };
  }, [scale, onScaleChange]);
  return { placed, scale };
}
