// 장면 도구를 떠 있는 패널이 없는 화면 위치에 맞춘다.
import type { PanelBounds } from "./scene-panel-bounds";

// 위쪽 공간부터 훑어 도구가 패널과 겹치지 않는 첫 좌표를 고른다.
export function sceneToolPosition(
  bounds: PanelBounds,
  width: number,
  height: number,
): { left: number; top: number } {
  const margin = 16;
  const maxLeft = Math.max(margin, bounds.width - width - margin);
  const maxTop = Math.max(margin, bounds.height - height - margin);
  for (let top = margin; top <= maxTop; top += 16) {
    for (let left = maxLeft; left >= margin; left -= 16) {
      const right = left + width;
      const bottom = top + height;
      if (
        bounds.blockers.every(
          (blocker) =>
            right <= blocker.left ||
            left >= blocker.right ||
            bottom <= blocker.top ||
            top >= blocker.bottom,
        )
      )
        return { left, top };
    }
  }
  return { left: margin, top: maxTop };
}
