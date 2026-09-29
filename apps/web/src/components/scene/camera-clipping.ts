// 전국 화면의 깊이 정밀도와 건물 근접 확대를 카메라 거리에 맞춰 함께 유지한다.
export function cameraNearPlane(distance: number): number {
  return Math.max(0.001, Math.min(10, distance * 0.02));
}
