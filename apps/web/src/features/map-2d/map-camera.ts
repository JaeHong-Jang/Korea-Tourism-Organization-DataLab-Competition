// 2D 지도의 패널 회피 여백과 토큰 기반 카메라 이동을 계산한다.
import { largestClearRect } from "../../components/scene/camera-framing";
import type { PanelBounds } from "../../components/scene/scene-panel-bounds";

// CSS 이징의 시간축을 풀어 지도 이동에도 같은 곡선을 적용한다.
function cameraEasing() {
  const match = getComputedStyle(document.documentElement)
    .getPropertyValue("--ease")
    .match(/cubic-bezier\(([^)]+)\)/);
  const points = match?.[1].split(",").map(Number);
  if (points?.length !== 4 || points.some(Number.isNaN))
    return (progress: number) => progress;
  const [x1, y1, x2, y2] = points;
  const curve = (position: number, first: number, second: number) =>
    3 * (1 - position) ** 2 * position * first +
    3 * (1 - position) * position ** 2 * second +
    position ** 3;
  return (progress: number) => {
    let low = 0;
    let high = 1;
    for (let index = 0; index < 12; index++) {
      const middle = (low + high) / 2;
      if (curve(middle, x1, x2) < progress) low = middle;
      else high = middle;
    }
    return curve((low + high) / 2, y1, y2);
  };
}

// 감소 설정이면 즉시 이동하고 아니면 계약 토큰의 카메라 시간과 이징을 쓴다.
export const cameraMotion = () => ({
  duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? 0
    : Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--dur-camera",
        ),
      ),
  easing: cameraEasing(),
});

// 패널 경계 캐시의 빈 영역에 전국 지도를 맞춘다.
export function mapPadding(bounds: PanelBounds) {
  const safe = largestClearRect(bounds);
  const margin = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--space-6"),
  );
  return {
    left: Math.max(0, safe.left + margin),
    right: Math.max(0, bounds.width - safe.right + margin),
    top: Math.max(0, safe.top + margin),
    bottom: Math.max(0, bounds.height - safe.bottom + margin),
  };
}
