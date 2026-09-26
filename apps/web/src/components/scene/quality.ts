// 프레임 상태와 접근성 설정에 따라 장면 품질을 세 단계로 제한한다.
export type SceneQuality = "high" | "medium" | "low";

export type QualityMode = SceneQuality | "auto";

export type QualityWindow = {
  frames: number;
  elapsed: number;
  slow: number;
  fast: number;
  cooldownUntil: number;
  recovered: boolean;
};

const levels: SceneQuality[] = ["low", "medium", "high"];

// 성능 감지기의 반복 이벤트가 품질 범위를 벗어나지 않게 한다.
export function shiftQuality(
  current: SceneQuality,
  change: -1 | 1,
): SceneQuality {
  const index = levels.indexOf(current);
  return levels[Math.max(0, Math.min(levels.length - 1, index + change))];
}

// 품질 단계가 바뀌어도 성능 회귀 계수와 곱할 기본 픽셀 비율을 유지한다.
export function qualityDpr(quality: SceneQuality): number {
  return quality === "high" ? 1 : quality === "medium" ? 0.85 : 0.65;
}

// 작은 CPU 또는 메모리를 보고 첫 장면의 렌더링 부담을 낮춘다.
export function recommendedQuality(
  cores?: number,
  memoryGb?: number,
): SceneQuality {
  return (cores !== undefined && cores <= 4) ||
    (memoryGb !== undefined && memoryGb <= 4)
    ? "low"
    : "high";
}

// 60프레임 평균을 두 번 확인해 강등하고 세 번 빠르면 한 단계만 복구한다.
export function sampleQuality(
  window: QualityWindow,
  frameMs: number,
  nowMs: number,
): -1 | 0 | 1 {
  window.frames++;
  window.elapsed += frameMs;
  if (window.frames < 60) return 0;
  const mean = window.elapsed / window.frames;
  window.frames = 0;
  window.elapsed = 0;
  window.slow = mean > 34 ? window.slow + 1 : 0;
  window.fast = mean < 20 ? window.fast + 1 : 0;
  if (nowMs < window.cooldownUntil) return 0;
  if (window.slow >= 2) {
    window.slow = 0;
    window.fast = 0;
    window.recovered = false;
    window.cooldownUntil = nowMs + 8000;
    return -1;
  }
  if (window.fast >= 3 && !window.recovered) {
    window.fast = 0;
    window.recovered = true;
    window.cooldownUntil = nowMs + 8000;
    return 1;
  }
  return 0;
}

// CSS 계약의 3D 색을 화면 테마와 같은 문서에서 읽는다.
export function sceneColor(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(`--scene-${name}`)
    .trim();
}
