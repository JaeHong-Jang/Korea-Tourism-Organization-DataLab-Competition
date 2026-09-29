// 중첩 그룹까지 같은 렌더 순서를 적용해 지도 색면이 사람과 시설을 덮지 못하게 한다.
import type { Object3D } from "three";

// 실제 지형·건물의 깊이 검사는 유지하고 지면 합성 이후에 도시 활동을 그린다.
export function applyActivityRenderLayer(root: Object3D) {
  root.traverse((object) => {
    object.renderOrder = 5;
  });
}
