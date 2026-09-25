// 행사일 해 위치와 낮·밤 전환을 행사장 조명에 적용한다.
import { type SceneQuality, sceneColor } from "../quality";
import type { VenueEvent } from "./sites";
import { venueSun } from "./time";

// 해 고도와 방위를 행사 장소에 적용하고 밤에 창문과 역 조명을 켠다.
export function VenueLight({
  event,
  hour,
  quality,
}: {
  event: VenueEvent;
  hour: number;
  quality: SceneQuality;
}) {
  const sun = venueSun(event, hour);
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
      <hemisphereLight
        color={sceneColor(`sky-${sun.sky}`)}
        groundColor={sceneColor("board-side")}
        intensity={night ? 0.65 : dusk ? 1 : 1.3}
      />
      <directionalLight
        position={position}
        color={dusk ? sceneColor("window-glow") : sceneColor("sky-day")}
        intensity={night ? 0.5 : dusk ? 1.2 : 1.7}
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
