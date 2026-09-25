// 날씨 종류와 품질 단계에 따라 장면 안의 입자·구름·안개를 구성한다.
import type { Weather } from "@crowdcast/contracts/types";
import { type SceneQuality, sceneColor } from "../quality";
import { CloudDeck } from "./cloud-deck";
import { Precipitation } from "./precipitation";
import { weatherEffects } from "./state";

// 안개는 규모에 맞게 옅게 적용하고 품질 낮음에서는 모든 효과를 끈다.
export function WeatherScene({
  weather,
  quality,
  reducedMotion,
  center,
  span,
}: {
  weather: Weather | null;
  quality: SceneQuality;
  reducedMotion: boolean;
  center: [number, number];
  span: number;
}) {
  const effects = weatherEffects(weather, quality);
  return (
    <>
      {effects.fog && (
        <fogExp2 attach="fog" args={[sceneColor("sky-day"), 0.75 / span]} />
      )}
      {effects.cloudy && <CloudDeck center={center} span={span} />}
      {effects.precipitation && (
        <Precipitation
          kind={effects.precipitation}
          count={effects.particles}
          reducedMotion={reducedMotion}
          span={Math.min(span, 300)}
        />
      )}
    </>
  );
}
