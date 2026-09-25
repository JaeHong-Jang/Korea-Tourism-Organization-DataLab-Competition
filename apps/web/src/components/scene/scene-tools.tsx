// 품질 수동 선택과 장면 저장을 캔버스의 키보드 접근 가능한 모서리에 둔다.
import type { QualityMode } from "./quality";
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
  return (
    <div className="scene-tools">
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
