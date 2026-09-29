// 실제 지도 좌표를 화면에 투영해 일반 DOM 행사 표식을 카메라와 함께 움직인다.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Vector3 } from "three";
import { LAND_SURFACE_Y } from "../scene-height";
import { terrainHeight, type ElevationGrid } from "../terrain/elevation";
import type { FestivalPin, PinElements } from "./festival-pins";

// 카메라나 표식이 바뀐 렌더에서만 DOM 위치를 갱신한다.
export function MapPinPositions({
  pins,
  elements,
  elevation,
}: {
  pins: FestivalPin[];
  elements: PinElements;
  elevation?: ElevationGrid;
}) {
  const projected = useMemo(() => new Vector3(), []);
  const invalidate = useThree((state) => state.invalidate);
  const previous = useMemo(() => new Float64Array(32).fill(Number.NaN), []);
  const stale = useRef(true);
  const lastPins = useRef<FestivalPin[] | null>(null),
    lastSize = useRef([0, 0]);
  useEffect(() => {
    if (lastPins.current !== pins) {
      lastPins.current = pins;
      stale.current = true;
      invalidate();
    }
  }, [pins, invalidate]);
  useFrame(({ camera, size }) => {
    camera.updateMatrixWorld();
    const world = camera.matrixWorld.elements,
      projection = camera.projectionMatrix.elements;
    let changed =
      stale.current ||
      lastSize.current[0] !== size.width ||
      lastSize.current[1] !== size.height;
    lastSize.current[0] = size.width;
    lastSize.current[1] = size.height;
    for (let i = 0; i < 16; i++) {
      if (previous[i] !== world[i] || previous[i + 16] !== projection[i])
        changed = true;
      previous[i] = world[i];
      previous[i + 16] = projection[i];
    }
    if (!changed) return;
    stale.current = false;
    for (const pin of pins) {
      const element = elements.current.get(pin.festival.eventId);
      if (!element) continue;
      projected
        .set(pin.point[0], LAND_SURFACE_Y + 0.004 + terrainHeight(elevation, ...pin.point), pin.point[1])
        .project(camera);
      const visible =
        Math.abs(projected.x) < 1.05 &&
        Math.abs(projected.y) < 1.05 &&
        Math.abs(projected.z) < 1;
      element.style.visibility = visible ? "visible" : "hidden";
      element.style.transform = `translate(${((projected.x + 1) * size.width) / 2}px, ${((1 - projected.y) * size.height) / 2}px) translate(-50%, calc(-100% - 24px))`;
    }
  });
  return null;
}
