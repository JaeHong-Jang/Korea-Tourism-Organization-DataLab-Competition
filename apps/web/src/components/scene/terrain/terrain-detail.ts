// 전국 색면에 지역 확대용 세분화를 적용하지 않도록 화면 폭에 맞춰 고도 표본을 정한다.
export function terrainDetailStep(width: number): number {
  return Math.max(0.06, Math.min(8, width / 320));
}
