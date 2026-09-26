// 동네 3D의 햇빛·달빛과 행사장 불빛 — 낮에는 실제 해 방향, 밤에는 화면의 달 쪽에서 비춘다.
import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import SunCalc from "suncalc";
import { Object3D } from "three";
import { useTheme } from "../../../lib/theme/theme-provider";
import { type SceneQuality, sceneColor } from "../quality";

// 동네 구도에서 화면 위쪽에 보이는 달 자리(행사장 기준 미터).
export const CITY_MOON: [number, number, number] = [-965, 80, -1218];

// 그림자는 조명·품질이 바뀔 때만 한 번 다시 굽는다(정적 장면).
export function CityLight({
  lng,
  lat,
  quality,
  revision,
}: {
  lng: number;
  lat: number;
  quality: SceneQuality;
  revision: unknown;
}) {
  const { at, sky } = useTheme();
  const gl = useThree((state) => state.gl);
  const target = useMemo(() => new Object3D(), []);
  const night = sky === "night";
  const dusk = sky === "dusk";
  const { altitude, azimuth } = SunCalc.getPosition(at, lat, lng);
  const height = Math.max(0.25, Math.sin(altitude));
  const position: [number, number, number] = night
    ? [CITY_MOON[0] * 0.6, 900, CITY_MOON[2] * 0.6]
    : [-Math.sin(azimuth) * 1100, height * 1300, Math.cos(azimuth) * 1100];

  // 정적 그림자맵을 쓰고 조건이 바뀐 다음 프레임에 한 번 갱신한다.
  useLayoutEffect(() => {
    gl.shadowMap.autoUpdate = false;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 해·시각이 바뀌면 그림자를 다시 구워야 한다.
  useLayoutEffect(() => {
    if (quality === "high" && revision) gl.shadowMap.needsUpdate = true;
  }, [gl, quality, revision, sky, at]);
  useEffect(() => {
    gl.toneMappingExposure = night ? 1.1 : 1.2;
  }, [gl, night]);

  return (
    <>
      <primitive object={target} />
      <hemisphereLight
        color={night ? sceneColor("moonlight") : sceneColor("sky-day")}
        groundColor={sceneColor("board-side")}
        intensity={night ? 0.32 : dusk ? 1.05 : 1.35}
      />
      <directionalLight
        position={position}
        target={target}
        color={
          night
            ? sceneColor("moonlight")
            : dusk
              ? sceneColor("window-glow")
              : sceneColor("sunlight")
        }
        intensity={night ? 0.55 : dusk ? 1.3 : 1.9}
        castShadow={quality === "high"}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={10}
        shadow-camera-far={4000}
        shadow-camera-left={-1300}
        shadow-camera-right={1300}
        shadow-camera-top={1300}
        shadow-camera-bottom={-1300}
        shadow-bias={-0.0004}
        shadow-normalBias={1.5}
      />
      {night && (
        <pointLight
          position={[0, 60, 0]}
          color={sceneColor("window-glow")}
          intensity={16000}
          distance={520}
          decay={1.6}
        />
      )}
    </>
  );
}
