// 모든 축제의 실제 위치를 화면 크기가 일정한 점으로 표시하고 가까운 점을 선택한다.
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  BufferGeometry,
  Float32BufferAttribute,
  type Points,
  Vector3,
} from "three";
import type { PlacedFestival } from "./festival-models/placement";
import { LAND_SURFACE_Y } from "./scene-height";

export function FestivalMapPoints({
  placed,
  onPick,
}: {
  placed: PlacedFestival[];
  onPick: (id: string) => void;
}) {
  const { camera, size } = useThree();
  const geometry = useMemo(() => {
    const result = new BufferGeometry();
    result.setAttribute(
      "position",
      new Float32BufferAttribute(
        placed.flatMap(({ x, z }) => [x, LAND_SURFACE_Y + 0.015, z]),
        3,
      ),
    );
    return result;
  }, [placed]);
  useEffect(() => {
    document.documentElement.dataset.festivalMapPoints = String(placed.length);
    return () => {
      geometry.dispose();
      delete document.documentElement.dataset.festivalMapPoints;
    };
  }, [geometry, placed.length]);

  // 지리 거리 대신 화면의 10픽셀 범위만 클릭으로 받아 확대 중 오선택을 막는다.
  const raycast: Points["raycast"] = function (this: Points, raycaster, hits) {
    const pointer = raycaster.ray.at(1, new Vector3()).project(camera);
    const point = new Vector3();
    let best = 100;
    let index = -1;
    placed.forEach(({ x, z }, i) => {
      point.set(x, LAND_SURFACE_Y + 0.015, z).project(camera);
      if (point.z < -1 || point.z > 1) return;
      const distance =
        (((point.x - pointer.x) * size.width) / 2) ** 2 +
        (((point.y - pointer.y) * size.height) / 2) ** 2;
      if (distance < best) {
        best = distance;
        index = i;
      }
    });
    if (index < 0) return;
    const selected = placed[index];
    point.set(selected.x, LAND_SURFACE_Y + 0.015, selected.z);
    hits.push({
      distance: raycaster.ray.origin.distanceTo(point),
      point: point.clone(),
      index,
      object: this,
    });
  };
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Three.js 점이며 키보드 선택은 같은 축제 목록과 이름표에서 제공한다.
    <points
      geometry={geometry}
      raycast={raycast}
      renderOrder={5}
      onClick={(event) => {
        if (event.delta > 2 || event.index === undefined) return;
        event.stopPropagation();
        const item = placed[event.index];
        if (item) onPick(item.festival.eventId);
      }}
    >
      <pointsMaterial
        color="#ef8b38"
        size={7}
        sizeAttenuation={false}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  );
}
