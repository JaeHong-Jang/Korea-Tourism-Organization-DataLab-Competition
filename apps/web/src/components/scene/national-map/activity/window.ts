// 카메라 화면의 지도 범위에 여유를 두고 활동량 상한을 정한다.
import { projectKorea } from "../../projection";
import type { SceneQuality } from "../../quality";
import type { MapPoint, MapViewport } from "../types";
export type ActivityWindow = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  width: number;
};

// 경위도 사각형의 네 모서리를 모두 투영해 회전·기울임 화면을 덮는다.
export function activityWindow(
  view: MapViewport,
  margin = 0.15,
): ActivityWindow {
  const [w, s, e, n] = view.bounds;
  const points = [
    [w, s],
    [w, n],
    [e, s],
    [e, n],
  ].map(([lng, lat]) => projectKorea(lng, lat));
  const pad = view.width * margin;
  return {
    minX: Math.min(...points.map((p) => p[0])) - pad,
    maxX: Math.max(...points.map((p) => p[0])) + pad,
    minZ: Math.min(...points.map((p) => p[1])) - pad,
    maxZ: Math.max(...points.map((p) => p[1])) + pad,
    width: view.width,
  };
}

// 화면 밖 여유 영역을 떠난 객체만 정리하고 화면에 남은 객체는 같은 상태를 유지한다.
export function inWindow(point: MapPoint, window: ActivityWindow, margin = 0) {
  return (
    point[0] >= window.minX - margin &&
    point[0] <= window.maxX + margin &&
    point[1] >= window.minZ - margin &&
    point[1] <= window.maxZ + margin
  );
}

// 전국에서는 작은 객체를 생략하고 확대 화면의 면적과 품질에 따라 상한을 제한한다.
export function activityCaps(
  width: number,
  quality: SceneQuality,
  pixels = 1600 * 900,
) {
  const factor =
    (quality === "low" ? 0.45 : quality === "high" ? 1 : 0.75) *
    Math.max(0.5, Math.min(1, pixels / (1600 * 900)));
  return {
    cars: width <= 35 ? Math.round(180 * factor) : 0,
    people: width <= 7 ? Math.round(640 * factor) : 0,
    trains: width <= 90 ? Math.max(1, Math.round(6 * factor)) : 0,
  };
}
