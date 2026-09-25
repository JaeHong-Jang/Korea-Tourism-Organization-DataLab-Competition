// 건물 벽에 반복해 붙일 창문 한 칸 그림 — 낮에는 유리, 밤에는 불 켜진 창만 빛나게 한다.
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

// 창 한 칸의 실제 크기(m) — 벽 UV가 미터 단위라 반복 횟수로 바로 쓴다(층 높이는 과장 1.4배 반영).
export const WINDOW_CELL = { width: 3.6, height: 4.2 };

// 흰 벽 위에 유리창 하나(벽 색은 정점 색이 곱해진다). lit이면 창만 흰색인 발광용 그림.
export function windowTexture(glass: string, lit = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = lit ? "#000000" : "#ffffff";
    context.fillRect(0, 0, 64, 64);
    context.fillStyle = lit ? "#ffffff" : glass;
    context.fillRect(13, 16, 38, 30);
    if (!lit) {
      // 창틀 아래 그늘 한 줄로 입체감을 준다.
      context.fillStyle = "rgba(0,0,0,0.12)";
      context.fillRect(13, 46, 38, 3);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1 / WINDOW_CELL.width, 1 / WINDOW_CELL.height);
  if (!lit) texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
