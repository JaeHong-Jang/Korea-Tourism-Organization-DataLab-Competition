// 현재 렌더링된 장면과 정직한 설명 띠를 PNG로 내려받는다.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";

export type CaptureScreen = "national" | "venue";

// 지역 시각을 파일 이름에 넣어 발표 캡처를 다시 찾기 쉽게 한다.
export function captureFilename(screen: CaptureScreen, at: Date): string {
  const date = `${at.getFullYear()}${String(at.getMonth() + 1).padStart(2, "0")}${String(at.getDate()).padStart(2, "0")}`;
  const time = `${String(at.getHours()).padStart(2, "0")}${String(at.getMinutes()).padStart(2, "0")}`;
  return `crowdcast-${screen}-${date}-${time}.png`;
}

// WebGL 버퍼가 지워지기 전에 2D 캔버스로 복사하고 하단 띠를 덧붙인다.
export function downloadScenePng(
  source: HTMLCanvasElement,
  screen: CaptureScreen,
  note: string,
): void {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  const context = canvas.getContext("2d");
  if (!context) return;
  const fontSize = Math.max(12, Math.min(16, Math.round(source.width / 75)));
  context.font = `${fontSize}px sans-serif`;
  const lines: string[] = [];
  let line = "";
  for (const word of note.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && context.measureText(next).width > source.width - 32) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  const band = Math.max(44, lines.length * fontSize * 1.45 + 16);
  canvas.height = source.height + band;
  context.drawImage(source, 0, 0);
  context.fillStyle = getComputedStyle(document.documentElement)
    .getPropertyValue("--surface")
    .trim();
  context.fillRect(0, source.height, canvas.width, band);
  context.fillStyle = getComputedStyle(document.documentElement)
    .getPropertyValue("--ink")
    .trim();
  context.font = `${fontSize}px sans-serif`;
  context.textBaseline = "middle";
  lines.forEach((text, index) => {
    context.fillText(
      text,
      16,
      source.height + 8 + fontSize * (index + 0.7),
      canvas.width - 32,
    );
  });
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = captureFilename(screen, new Date());
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}

// 후처리 뒤 실행하며 낮음 품질에서는 기본 렌더를 직접 마친 다음 한 번 읽는다.
export function SceneCaptureFrame({
  request,
  screen,
  note,
  postprocessed,
}: {
  request: number;
  screen: CaptureScreen;
  note: string;
  postprocessed: boolean;
}) {
  const pending = useRef(false);
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    if (request > 0) pending.current = true;
  }, [request]);
  useFrame(() => {
    if (!postprocessed) gl.render(scene, camera);
    if (!pending.current) return;
    pending.current = false;
    downloadScenePng(gl.domElement, screen, note);
  }, 2);
  return null;
}
