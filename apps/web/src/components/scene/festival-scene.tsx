// 행사 목록을 장면 모형·군중·이름표와 접근성 목록으로 함께 투영한다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { useEffect, useMemo } from "react";
import { DollCrowd } from "./crowd/doll-crowd";
import { crowdScale } from "./crowd-scale";
import { FestivalModels } from "./festival-models";
import { placeFestivals } from "./festival-models/placement";
import { GradeMark } from "./grade-mark";
import { NameTags } from "./name-tag";
import type { SceneQuality } from "./quality";

export type Props = {
  festivals?: FestivalSummary[];
  onScaleChange?: (peoplePerDoll: number) => void;
};

// 목록 전체의 같은 축척을 모형 배치와 화면 범례에 전달한다.
export function useScene(
  festivals: FestivalSummary[],
  quality: SceneQuality,
  onScaleChange?: (peoplePerDoll: number) => void,
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

  // 진단과 범례가 실제 인스턴스 수 및 공통 축척을 읽게 한다.
  useEffect(() => {
    document.documentElement.dataset.sceneDollCount = String(scale.total);
    document.documentElement.dataset.scenePeoplePerDoll = String(
      scale.peoplePerDoll,
    );
    onScaleChange?.(scale.peoplePerDoll);
    return () => {
      delete document.documentElement.dataset.sceneDollCount;
      delete document.documentElement.dataset.scenePeoplePerDoll;
    };
  }, [scale, onScaleChange]);
  return { placed, scale };
}

// 데이터가 있을 때만 모형과 두 부위 인스턴스 군중을 GPU에 올린다.
export function Layer({
  scene,
  quality,
}: {
  scene: ReturnType<typeof useScene>;
  quality: SceneQuality;
}) {
  if (scene.placed.length === 0) return null;
  return (
    <>
      <FestivalModels placed={scene.placed} />
      <DollCrowd
        placed={scene.placed}
        counts={scene.scale.counts}
        shadows={quality === "high"}
      />
      <NameTags placed={scene.placed} />
    </>
  );
}

// 장면에서 숨겨진 행사도 키보드와 화면 낭독으로 확인할 수 있다.
export function List({ scene }: { scene: ReturnType<typeof useScene> }) {
  return (
    <ol className="scene-festival-list" aria-label="장면의 견본 행사">
      {scene.placed.map(({ festival }) => (
        <li key={festival.eventId}>
          {festival.name}, {festival.sigunguName},{" "}
          <GradeMark level={festival.level} />
        </li>
      ))}
    </ol>
  );
}
