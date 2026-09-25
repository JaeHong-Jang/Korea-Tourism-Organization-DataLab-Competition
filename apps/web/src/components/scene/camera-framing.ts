// 패널을 뺀 화면 영역에 전국 판 네 모서리를 맞춘다.
import { PerspectiveCamera, Vector3 } from "three";
import type { PanelBounds } from "./scene-panel-bounds";
import type { ScreenRect } from "./tag-visibility";

export type OverviewPose = {
  target: Vector3;
  position: Vector3;
  safe: ScreenRect;
};

// 패널 경계로 나눈 후보 중 판을 가장 넓게 보여 줄 빈 직사각형을 고른다.
export function largestClearRect(bounds: PanelBounds): ScreenRect {
  const { width, height } = bounds;
  const blockers = bounds.blockers.filter(
    (box) =>
      box.right > box.left &&
      box.bottom > box.top &&
      box.right > 0 &&
      box.left < width &&
      box.bottom > 0 &&
      box.top < height,
  );
  const xs = [0, width, ...blockers.flatMap((box) => [box.left, box.right])]
    .map((value) => Math.max(0, Math.min(width, value)))
    .sort((a, b) => a - b);
  const ys = [0, height, ...blockers.flatMap((box) => [box.top, box.bottom])]
    .map((value) => Math.max(0, Math.min(height, value)))
    .sort((a, b) => a - b);
  let best: ScreenRect = { left: 0, top: 0, right: width, bottom: height };
  let area = -1;
  for (let x = 0; x < xs.length - 1; x++) {
    for (let xx = x + 1; xx < xs.length; xx++) {
      for (let y = 0; y < ys.length - 1; y++) {
        for (let yy = y + 1; yy < ys.length; yy++) {
          const rect = {
            left: xs[x],
            right: xs[xx],
            top: ys[y],
            bottom: ys[yy],
          };
          const size = (rect.right - rect.left) * (rect.bottom - rect.top);
          if (size <= area || size <= 0) continue;
          if (
            blockers.some(
              (box) =>
                rect.right > box.left &&
                rect.left < box.right &&
                rect.bottom > box.top &&
                rect.top < box.bottom,
            )
          )
            continue;
          best = rect;
          area = size;
        }
      }
    }
  }
  return best;
}

// 기존 사선 시점을 유지하며 투영한 네 모서리가 안전 영역에 드는 최소 거리를 찾는다.
export function overviewPose(
  bounds: PanelBounds,
  center: [number, number],
  width: number,
  depth: number,
  fov: number,
): OverviewPose {
  const empty = largestClearRect(bounds);
  const safe = {
    left: empty.left + 14,
    right: empty.right - 14,
    top: empty.top + 14,
    bottom: empty.bottom - 14,
  };
  const offset = new Vector3(430, 590, 720);
  const camera = new PerspectiveCamera(
    fov,
    bounds.width / bounds.height,
    10,
    5000,
  );
  camera.position.copy(offset);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const matrix = camera.matrixWorld.elements;
  const rightX = matrix[0];
  const rightZ = matrix[2];
  const upX = matrix[4];
  const upZ = matrix[6];
  const determinant = rightX * upZ - rightZ * upX;
  const focalY = bounds.height / (2 * Math.tan((fov * Math.PI) / 360));
  const focalX = focalY;
  const midpointX = (safe.left + safe.right) / 2;
  const midpointY = (safe.top + safe.bottom) / 2;
  const corners = [
    new Vector3(center[0] - width / 2, 8, center[1] - depth / 2),
    new Vector3(center[0] + width / 2, 8, center[1] - depth / 2),
    new Vector3(center[0] - width / 2, 8, center[1] + depth / 2),
    new Vector3(center[0] + width / 2, 8, center[1] + depth / 2),
  ];
  const projected = new Vector3();
  const pose = (scale: number) => {
    const distance = offset.length() * scale;
    const screenRight = (-(midpointX - bounds.width / 2) * distance) / focalX;
    const screenUp = ((midpointY - bounds.height / 2) * distance) / focalY;
    const shiftX = (screenRight * upZ - screenUp * rightZ) / determinant;
    const shiftZ = (screenUp * rightX - screenRight * upX) / determinant;
    const target = new Vector3(center[0] + shiftX, 0, center[1] + shiftZ);
    const position = target.clone().addScaledVector(offset, scale);
    camera.position.copy(position);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    return { target, position };
  };
  const fits = (scale: number) => {
    pose(scale);
    return corners.every((corner) => {
      projected.copy(corner).project(camera);
      const x = ((projected.x + 1) * bounds.width) / 2;
      const y = ((1 - projected.y) * bounds.height) / 2;
      return (
        projected.z < 1 &&
        x >= safe.left &&
        x <= safe.right &&
        y >= safe.top &&
        y <= safe.bottom
      );
    });
  };
  let low = 0.4;
  let high = 3.8;
  for (let count = 0; count < 22; count++) {
    const middle = (low + high) / 2;
    if (fits(middle)) high = middle;
    else low = middle;
  }
  return { ...pose(high), safe };
}
