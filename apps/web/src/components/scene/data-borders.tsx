// 데이터 모드에서 땅·풍경은 그대로 두고 시군구 테두리를 예보 인파 구간 색(순차 5단계)의 굵은 띠로 두른다.
import { useEffect, useMemo } from "react";
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  MeshBasicMaterial,
} from "three";
import { tileStep } from "../../features/mini-korea/data-mode";
import type { LandAnchor } from "./land-anchor";
import { LAND_SURFACE_Y } from "./scene-height";

// 테두리 띠 높이 — 바탕 지도·도로 위, 건물 발밑. 폭(절반, km)은 구간이 높을수록 굵게 해 색이 옅은 구간도 구분되게 한다.
const Y = LAND_SURFACE_Y + 0.9;
const halfWidth = (step: number) => 0.5 + step * 0.25;

// 예보가 있는 시군구마다 외곽선을 따라 안쪽으로 띠를 깐다(없는 곳은 두르지 않는다).
export function borderGeometry(
  anchors: Map<string, LandAnchor>,
  totals: Map<string, number>,
  colorOf: (step: number) => Color,
) {
  const maximum = Math.max(0, ...totals.values());
  const positions: number[] = [];
  const colors: number[] = [];
  for (const [code, anchor] of anchors) {
    const step = tileStep(totals.get(code) ?? null, maximum);
    if (step <= 0) continue;
    const color = colorOf(step);
    const half = halfWidth(step);
    const ring = anchor.ring;
    for (let index = 0; index < ring.length; index++) {
      const [ax, az] = ring[index];
      const [bx, bz] = ring[(index + 1) % ring.length];
      const length = Math.hypot(bx - ax, bz - az);
      if (length < 0.01) continue;
      const nx = (-(bz - az) / length) * half;
      const nz = ((bx - ax) / length) * half;
      positions.push(
        ...[ax - nx, Y, az - nz, bx + nx, Y, bz + nz, bx - nx, Y, bz - nz],
        ...[ax - nx, Y, az - nz, ax + nx, Y, az + nz, bx + nx, Y, bz + nz],
      );
      for (let corner = 0; corner < 6; corner++)
        colors.push(color.r, color.g, color.b);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return geometry;
}

export function DataBorders({
  anchors,
  totals,
}: {
  anchors: Map<string, LandAnchor>;
  totals: Map<string, number>;
}) {
  const geometry = useMemo(() => {
    const style = getComputedStyle(document.documentElement);
    return borderGeometry(
      anchors,
      totals,
      (step) => new Color(style.getPropertyValue(`--seq-${step}`).trim()),
    );
  }, [anchors, totals]);
  const material = useMemo(
    () => new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }),
    [],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  return <mesh geometry={geometry} material={material} />;
}
