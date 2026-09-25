// 행사일 해 위치와 낮·밤 전환을 행사장 조명에 적용한다.
import { useThree } from "@react-three/fiber";
import { useLayoutEffect } from "react";
import { type SceneQuality, sceneColor } from "../quality";
import type { VenueEvent } from "./sites";
import { venueSun } from "./time";

// 해 고도와 방위를 행사 장소에 적용하고 밤에 창문과 역 조명을 켠다.
export function VenueLight({
  event,
  hour,
  quality,
  revision,
}: {
  event: VenueEvent;
  hour: number;
  quality: SceneQuality;
  // 건물·나무가 바뀌면(타일 교체) 그림자를 다시 굽는 표식.
  revision?: unknown;
}) {
  const gl = useThree((state) => state.gl);
  const sun = venueSun(event, hour);

  // 움직이지 않는 건물 그림자는 매 프레임 다시 그리지 않고 조건이 바뀐 다음 프레임에 한 번만 굽는다.
  useLayoutEffect(() => {
    gl.shadowMap.autoUpdate = false;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 시각·품질·타일이 바뀌면 그림자를 다시 굽는다.
  useLayoutEffect(() => {
    gl.shadowMap.needsUpdate = true;
  }, [gl, hour, quality, revision]);
  const night = sun.sky === "night";
  const dusk = sun.sky === "dusk";
  const elevation = night ? 0.2 : Math.max(0.1, Math.sin(sun.altitude));
  const position: [number, number, number] = [
    -Math.sin(sun.azimuth) * 900,
    elevation * 900,
    Math.cos(sun.azimuth) * 900,
  ];
  return (
    <>
      <color attach="background" args={[sceneColor(`sky-${sun.sky}`)]} />
      {/* 밤에는 짙은 밤하늘색 대신 달빛으로 비춰 땅·길이 읽히게 한다(동네 3D와 같은 밝기). */}
      <hemisphereLight
        color={night ? sceneColor("moonlight") : sceneColor(`sky-${sun.sky}`)}
        groundColor={sceneColor("board-side")}
        intensity={night ? 0.36 : dusk ? 1 : 1.3}
      />
      <directionalLight
        position={position}
        color={
          night
            ? sceneColor("moonlight")
            : dusk
              ? sceneColor("window-glow")
              : sceneColor("sky-day")
        }
        intensity={night ? 0.6 : dusk ? 1.2 : 1.7}
        castShadow={quality === "high" && !night}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-1250}
        shadow-camera-right={1250}
        shadow-camera-top={1250}
        shadow-camera-bottom={-1250}
      />
      {night && (
        <pointLight
          position={[0, 35, 0]}
          color={sceneColor("window-glow")}
          intensity={2000}
          distance={260}
        />
      )}
    </>
  );
}
