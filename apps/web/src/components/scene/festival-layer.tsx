// 전국 판 위에 병합 모형과 인스턴스 군중·이름표를 올린다.

import { useSelectionStore } from "../../lib/selection-store";
import { DollCrowd } from "./crowd/doll-crowd";
import { FestivalHitTargets } from "./festival-hit-targets";
import { FestivalModels } from "./festival-models";
import { NameTags } from "./name-tag";
import { LAND_SURFACE_Y } from "./scene-height";
import type { useScene } from "./use-scene";

// 데이터가 있을 때만 행사 자원을 GPU에 올린다.
export function FestivalLayer({
  scene,
  center,
  reducedMotion = false,
}: {
  scene: ReturnType<typeof useScene>;
  center: [number, number];
  reducedMotion?: boolean;
}) {
  const selectedId = useSelectionStore((state) => state.selectedFestivalId);
  const selectFestival = useSelectionStore((state) => state.selectFestival);
  const selected = scene.placed.find(
    ({ festival }) => festival.eventId === selectedId,
  );
  if (scene.placed.length === 0) return null;
  return (
    <>
      <FestivalModels placed={scene.placed} />
      <FestivalHitTargets placed={scene.placed} onPick={selectFestival} />
      {selected && (
        <mesh
          position={[selected.x, LAND_SURFACE_Y + selected.y + 0.5, selected.z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[9, 11, 28]} />
          <meshBasicMaterial
            color={getComputedStyle(document.documentElement)
              .getPropertyValue("--focus")
              .trim()}
            side={2}
          />
        </mesh>
      )}
      <DollCrowd
        placed={scene.placed}
        counts={scene.scale.counts}
        center={center}
        reducedMotion={reducedMotion}
      />
      <NameTags
        placed={scene.placed}
        center={center}
        selectedId={selectedId}
        onPick={selectFestival}
      />
    </>
  );
}
