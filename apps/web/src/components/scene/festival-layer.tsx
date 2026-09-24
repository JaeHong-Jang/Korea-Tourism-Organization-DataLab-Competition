// 전국 판 위에 병합 모형과 인스턴스 군중·이름표를 올린다.
import { DollCrowd } from "./crowd/doll-crowd";
import { FestivalModels } from "./festival-models";
import { NameTags } from "./name-tag";
import type { useScene } from "./use-scene";

// 데이터가 있을 때만 행사 자원을 GPU에 올린다.
export function FestivalLayer({
  scene,
  center,
}: {
  scene: ReturnType<typeof useScene>;
  center: [number, number];
}) {
  if (scene.placed.length === 0) return null;
  return (
    <>
      <FestivalModels placed={scene.placed} />
      <DollCrowd
        placed={scene.placed}
        counts={scene.scale.counts}
        center={center}
      />
      <NameTags placed={scene.placed} center={center} />
    </>
  );
}
