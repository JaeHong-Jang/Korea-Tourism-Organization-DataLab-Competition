// 프레임 상태와 접근성 설정에 따라 장면 품질을 세 단계로 제한한다.
export type SceneQuality = "high" | "medium" | "low";

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

// CSS 계약의 3D 색을 화면 테마와 같은 문서에서 읽는다.
export function sceneColor(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(`--scene-${name}`)
    .trim();
}
