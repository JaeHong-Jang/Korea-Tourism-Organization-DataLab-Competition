// 테마 엔진의 시각과 서울 해 위치로 무광 장면 조명을 정한다.

import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import SunCalc from "suncalc";
import { Object3D } from "three";
import { useTheme } from "../../lib/theme/theme-provider";
import type { SceneQuality } from "./quality";
import { sceneColor } from "./quality";

// 고도와 방위를 광원 위치로 옮기고 밤에는 약한 달빛으로 유지한다.
export function SunLight({
  quality,
  revision,
  center,
  width,
  depth,
}: {
  quality: SceneQuality;
  revision: unknown;
  center: [number, number];
  width: number;
  depth: number;
}) {
  const { at, sky } = useTheme();
  const gl = useThree((state) => state.gl);
  const { altitude, azimuth } = SunCalc.getPosition(at, 37.5665, 126.978);
  const daylight = sky === "day";
  const twilight = sky === "dusk";
  const height = sky === "night" ? 0.55 : Math.max(0.12, Math.sin(altitude));
  const shadowExtent = Math.hypot(width, depth) * 0.8;
  const target = useMemo(() => new Object3D(), []);
  const position: [number, number, number] = [
    center[0] - Math.sin(azimuth) * 800,
    height * 850,
    center[1] + Math.cos(azimuth) * 800,
  ];
  const skyColor = sceneColor(`sky-${sky}`);

  // 장면 밝기는 해 상태별로 조절하고 헤더와 같은 상태를 캡처에 기록한다.
  useEffect(() => {
    document.documentElement.dataset.sceneSky = sky;
    gl.toneMappingExposure = sky === "night" ? 1.65 : 1.25;
    return () => {
      delete document.documentElement.dataset.sceneSky;
    };
  }, [gl, sky]);

  // 정적 장면 그림자는 해·품질·행사 목록이 바뀔 때만 다시 만든다.
  useLayoutEffect(() => {
    gl.shadowMap.autoUpdate = false;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);

  // 장면이나 조명 조건을 바꾼 다음 프레임에서 그림자맵을 한 번 갱신한다.
  useLayoutEffect(() => {
    if (quality === "high" && revision && sky && at && width > 0 && depth > 0)
      gl.shadowMap.needsUpdate = true;
  }, [gl, at, sky, quality, revision, width, depth]);

  // 광원 표적과 그림자 절두체를 전국 판 중심에 맞춘다.
  useEffect(() => {
    target.position.set(center[0], 0, center[1]);
    target.updateMatrixWorld();
  }, [center, target]);

  return (
    <>
      <primitive object={target} />
      <color attach="background" args={[skyColor]} />
      <hemisphereLight
        color={daylight ? skyColor : sceneColor("land-1")}
        groundColor={sceneColor("board-side")}
        intensity={daylight ? 1.25 : twilight ? 1.1 : 0.95}
      />
      <directionalLight
        position={position}
        target={target}
        color={twilight ? sceneColor("window-glow") : sceneColor("sky-day")}
        intensity={daylight ? 1.7 : twilight ? 1.35 : 0.9}
        castShadow={quality === "high" && !twilight}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={1}
        shadow-camera-far={Math.max(2600, shadowExtent * 3)}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        shadow-bias={-0.0001}
        shadow-normalBias={0.02}
      />
    </>
  );
}
