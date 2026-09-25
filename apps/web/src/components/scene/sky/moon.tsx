// 밤 장면 위쪽에 달빛이 번지는 달을 띄운다(화면 장식 — 실제 달 위치가 아니다).
import { useEffect, useMemo } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";

// 기본 구도에서 화면 위쪽 가운데보다 조금 왼쪽에 보이는 자리(판 중심 기준)다.
export const MOON_OFFSET: [number, number, number] = [-1100, -150, -1350];

// 번짐·원판·옅은 무늬를 한 장의 캔버스에 그려 스프라이트 하나로 쓴다.
function moonTexture(colors: { glow: string; face: string; shade: string }) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) {
    const middle = size / 2;
    const halo = context.createRadialGradient(
      middle,
      middle,
      20,
      middle,
      middle,
      middle,
    );
    halo.addColorStop(0, colors.glow);
    halo.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = halo;
    context.fillRect(0, 0, size, size);
    const face = context.createRadialGradient(
      middle - 10,
      middle - 12,
      4,
      middle,
      middle,
      34,
    );
    face.addColorStop(0, colors.face);
    face.addColorStop(1, colors.shade);
    context.fillStyle = face;
    context.beginPath();
    context.arc(middle, middle, 34, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 0.18;
    context.fillStyle = colors.shade;
    for (const [x, y, r] of [
      [-10, -6, 7],
      [9, 8, 5],
      [4, -14, 4],
      [-6, 13, 3],
    ]) {
      context.beginPath();
      context.arc(middle + x, middle + y, r, 0, Math.PI * 2);
      context.fill();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

// 달은 깊이 검사 없이 하늘 공 앞, 판 뒤에 그린다.
export function Moon({
  center,
  colors,
}: {
  center: [number, number];
  colors: { glow: string; face: string; shade: string };
}) {
  const { glow, face, shade } = colors;
  const texture = useMemo(
    () => moonTexture({ glow, face, shade }),
    [glow, face, shade],
  );
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite
      position={[
        center[0] + MOON_OFFSET[0],
        MOON_OFFSET[1],
        center[1] + MOON_OFFSET[2],
      ]}
      scale={[520, 520, 1]}
      renderOrder={-8}
    >
      <spriteMaterial
        map={texture}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </sprite>
  );
}
