// 해 상태(낮·노을·밤)에 맞춰 하늘 공·별·달을 고른다.
import { useTheme } from "../../../lib/theme/theme-provider";
import { type SceneQuality, sceneColor } from "../quality";
import { Moon } from "./moon";
import { SkyDome } from "./sky-dome";
import { Starfield } from "./starfield";
import { Sunlight } from "./sunlight";

const STAR_COUNT: Record<SceneQuality, number> = {
  high: 420,
  medium: 300,
  low: 160,
};

// 밤에는 별과 달, 노을에는 옅은 별만, 낮에는 그라데이션 하늘과 햇빛 번짐을 둔다.
export function SkyScene({
  center,
  quality,
  reducedMotion,
  moonOffset,
  moonSize,
  sunStrength,
}: {
  center: [number, number];
  quality: SceneQuality;
  reducedMotion: boolean;
  moonOffset?: [number, number, number];
  moonSize?: number;
  sunStrength?: number;
}) {
  const { sky } = useTheme();
  return (
    <>
      <SkyDome
        center={center}
        top={sceneColor(`sky-${sky}-top`)}
        horizon={sceneColor(`sky-${sky}`)}
        bottom={sceneColor(`sky-${sky}-low`)}
      />
      {sky !== "day" && (
        <Starfield
          center={center}
          count={STAR_COUNT[quality]}
          opacity={sky === "night" ? 1 : 0.35}
          reducedMotion={reducedMotion}
        />
      )}
      {sky === "day" && (
        <Sunlight
          color={sceneColor("sunlight")}
          reducedMotion={reducedMotion}
          strength={sunStrength}
        />
      )}
      {sky === "night" && (
        <Moon
          center={center}
          offset={moonOffset}
          size={moonSize}
          colors={{
            glow: sceneColor("moon-glow"),
            face: sceneColor("moon-face"),
            shade: sceneColor("moon-shade"),
          }}
        />
      )}
    </>
  );
}
