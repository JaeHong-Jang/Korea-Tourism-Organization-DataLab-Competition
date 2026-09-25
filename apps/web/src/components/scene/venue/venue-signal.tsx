// 행사장 장면의 준비 상태와 프레임 진단 수치를 기록한다.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { FrameSignal } from "../scene-diagnostics";

// 프레임 진단은 견본 e2e와 성능 측정에서만 DOM에 숫자를 기록한다.
export function VenueSignal({
  buildings,
  cars,
  sky,
  measure,
}: {
  buildings: number;
  cars: number;
  sky: string;
  measure: boolean;
}) {
  const ready = useRef(false);
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    document.documentElement.dataset.venueBuildings = String(buildings);
    document.documentElement.dataset.venueCars = String(cars);
    document.documentElement.dataset.venueSky = sky;
    window.__crowdcastVenueRender = () => ({
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
    });
    return () => {
      delete document.documentElement.dataset.venueBuildings;
      delete document.documentElement.dataset.venueCars;
      delete document.documentElement.dataset.venueSky;
      delete window.__crowdcastVenueRender;
    };
  }, [buildings, cars, sky, gl]);
  useEffect(
    () => () => {
      delete document.documentElement.dataset.venueReady;
    },
    [],
  );
  useFrame(() => {
    if (!ready.current) {
      document.documentElement.dataset.venueReady = "true";
      ready.current = true;
    }
  });
  return <FrameSignal measure={measure} diagnostic={measure} />;
}

declare global {
  interface Window {
    __crowdcastVenueRender?: () => { calls: number; triangles: number };
    __crowdcastVenueVehicle?: () => number[];
  }
}
