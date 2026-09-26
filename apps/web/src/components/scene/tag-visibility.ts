// 행사 이름표가 장면 경계와 떠 있는 패널을 피하는지 판단한다.

export type ScreenRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

// 이름표 전체가 화면 안에 있고 패널과 겹치지 않을 때만 선택 표면을 남긴다.
export function tagFitsSafeArea(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  blockers: ScreenRect[],
): boolean {
  const left = x - width / 2;
  const right = x + width / 2;
  const top = y - height / 2;
  const bottom = y + height / 2;
  if (left < 0 || top < 0 || right > viewportWidth || bottom > viewportHeight)
    return false;
  // 카메라 이동 중 매 프레임 불리므로 콜백을 만들지 않고 인덱스로 훑는다(§5-3).
  for (let index = 0; index < blockers.length; index++) {
    const rect = blockers[index];
    if (
      right > rect.left &&
      left < rect.right &&
      bottom > rect.top &&
      top < rect.bottom
    )
      return false;
  }
  return true;
}
