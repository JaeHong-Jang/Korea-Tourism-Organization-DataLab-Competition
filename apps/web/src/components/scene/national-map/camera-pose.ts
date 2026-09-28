// 성남처럼 정사영으로 국토를 보고 패널을 제외한 영역에 전국 구도를 맞춘다.
import { OrthographicCamera, Vector3 } from "three";
import { largestClearRect } from "../camera-framing";
import { LAND_SURFACE_Y } from "../scene-height";
import type { PanelBounds } from "../scene-panel-bounds";

export const MAP_CAMERA_OFFSET = new Vector3(430, 800, 550);

// 같은 정사영 카메라에서 국토 모서리와 빈 화면의 중심을 계산한다.
export function nationalCameraPose(
  bounds: PanelBounds,
  center: [number, number],
  width: number,
  depth: number,
) {
  const safe = largestClearRect(bounds);
  const camera = new OrthographicCamera(
    -bounds.width / 2,
    bounds.width / 2,
    bounds.height / 2,
    -bounds.height / 2,
    0.1,
    5000,
  );
  const target = new Vector3(center[0], LAND_SURFACE_Y, center[1]);
  camera.position.copy(target).add(MAP_CAMERA_OFFSET);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  const points = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ].map(([x, z]) =>
    new Vector3(
      center[0] + (x * width) / 2,
      LAND_SURFACE_Y,
      center[1] + (z * depth) / 2,
    ).applyMatrix4(camera.matrixWorldInverse),
  );
  const dx =
    Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
  const dy =
    Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y));
  const zoom = Math.max(
    0.1,
    Math.min((safe.right - safe.left) / dx, (safe.bottom - safe.top) / dy) *
      0.9,
  );
  const matrix = camera.matrixWorld.elements;
  const sx = -(safe.left + safe.right - bounds.width) / (2 * zoom),
    sy = (safe.top + safe.bottom - bounds.height) / (2 * zoom);
  const determinant = matrix[0] * matrix[6] - matrix[2] * matrix[4];
  target.x += (sx * matrix[6] - sy * matrix[4]) / determinant;
  target.z += (sy * matrix[0] - sx * matrix[2]) / determinant;
  return { target, position: target.clone().add(MAP_CAMERA_OFFSET), zoom };
}
