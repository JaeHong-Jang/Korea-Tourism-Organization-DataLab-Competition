// 계약 날씨를 장면의 강수·구름·안개와 품질별 효과 상태로 바꾼다.
import type { Weather } from "@crowdcast/contracts/types";
import type { SceneQuality } from "../quality";

export type WeatherEffects = {
  precipitation: "rain" | "snow" | null;
  particles: number;
  cloudy: boolean;
  fog: boolean;
  wetGround: boolean;
};

// 소나기와 비/눈은 화면을 읽기 쉬운 단일 입자 종류로 단순화한다.
export function weatherEffects(
  weather: Weather | null,
  quality: SceneQuality,
): WeatherEffects {
  const known = weather?.source === "없음" ? null : weather;
  const precipitation =
    known?.pty === "눈" || known?.pty === "비/눈"
      ? "snow"
      : known?.pty === "비" || known?.pty === "소나기"
        ? "rain"
        : null;
  const enabled = quality !== "low";
  return {
    precipitation: enabled ? precipitation : null,
    particles: !enabled || !precipitation ? 0 : quality === "high" ? 160 : 80,
    cloudy: enabled && (known?.sky === "흐림" || known?.sky === "구름많음"),
    fog: enabled && known?.sky === "흐림" && !precipitation,
    wetGround: quality === "high" && precipitation === "rain",
  };
}
