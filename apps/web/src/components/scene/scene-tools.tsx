// 품질 수동 선택과 장면 저장을 캔버스의 키보드 접근 가능한 모서리에 둔다.

import { useLayoutEffect, useRef, useState } from "react";
import type { QualityMode } from "./quality";
import { observePanelBounds, type PanelBounds } from "./scene-panel-bounds";
import { sceneToolPosition } from "./scene-tool-placement";
import "./scene-tools.css";

// 자동 모드는 프레임 신호를 따르고 수동 모드는 사용자가 고른 단계를 유지한다.
export function SceneTools({
  mode,
  onModeChange,
  onSave,
}: {
  mode: QualityMode;
  onModeChange: (mode: QualityMode) => void;
  onSave: () => void;
}) {
  const tools = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 16, top: 16 });

  // 기존 패널 경계 캐시와 도구 크기로 클릭 가능한 빈 공간을 고른다.
  useLayoutEffect(() => {
    const element = tools.current;
    const stage = element?.closest<HTMLElement>(
      ".scene-stage, .venue-3d__frame",
    );
    if (!element || !stage) return;
    let bounds: PanelBounds = { width: 0, height: 0, blockers: [] };
    const place = () => {
      const next = sceneToolPosition(
        bounds,
        element.offsetWidth,
        element.offsetHeight,
      );
      setPosition((current) =>
        current.left === next.left && current.top === next.top ? current : next,
      );
    };
    const stop = observePanelBounds(stage, (measured) => {
      bounds = measured;
      place();
    });
    const observer = new ResizeObserver(place);
    observer.observe(element);
    return () => {
      stop();
      observer.disconnect();
    };
  }, []);

  return (
    <div className="scene-tools" ref={tools} style={position}>
      <label>
        장면 품질
        <select
          value={mode}
          onChange={(event) => onModeChange(event.target.value as QualityMode)}
        >
          <option value="auto">자동</option>
          <option value="high">높음</option>
          <option value="medium">보통</option>
          <option value="low">낮음 · 저사양</option>
        </select>
      </label>
      <button type="button" onClick={onSave}>
        장면 저장
      </button>
    </div>
  );
}
