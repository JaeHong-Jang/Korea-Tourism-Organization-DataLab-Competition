// 공용 헤더 도구 칸에 계약 날씨와 해 상태를 한 칩으로 보여 준다.

import type { Weather } from "@crowdcast/contracts/types";
import { Cloud, CloudRain, CloudSnow, SunMoon } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSelectionStore } from "../lib/selection-store";
import { useTheme } from "../lib/theme/theme-provider";
import { useWeather } from "../lib/use-weather";

// 초단기·단기 온도와 중기 최저~최고를 서로 다른 정보로 표기한다.
export function weatherChipText(
  place: string,
  sky: string,
  weather: Weather | null,
): string {
  if (!weather || weather.source === "없음")
    return `${place} 날씨 정보 없음 · ${sky}`;
  const temperature =
    weather.source === "중기예보" &&
    weather.tempMin != null &&
    weather.tempMax != null
      ? `${weather.tempMin}~${weather.tempMax}°`
      : weather.temp != null
        ? `${weather.temp}°`
        : "";
  const condition =
    weather.pty && weather.pty !== "없음"
      ? weather.pty
      : (weather.sky ?? "날씨 정보 없음");
  return `${place} ${temperature} ${condition} · ${sky}`
    .replace(/\s+/g, " ")
    .trim();
}

// 선택 행사 좌표가 있으면 그 지역을 쓰고 그 밖에는 서울 현재 날씨를 쓴다.
export function HeaderWeatherChip() {
  const [target, setTarget] = useState<Element | null>(null);
  const { at, sky } = useTheme();
  const selected = useSelectionStore((state) => state.selectedFestivalId);
  const festivals = useSelectionStore((state) => state.timelineFestivals);
  const festival = festivals.find((item) => item.eventId === selected);
  const lat = festival?.lat ?? 37.5665;
  const lng = festival?.lng ?? 126.978;
  const weather = useWeather(lat, lng, at);
  useEffect(() => setTarget(document.querySelector(".site-header__tools")), []);
  const skyText = sky === "day" ? "낮" : sky === "dusk" ? "노을" : "밤";
  const Icon =
    weather?.pty === "눈" || weather?.pty === "비/눈"
      ? CloudSnow
      : weather?.pty === "비" || weather?.pty === "소나기"
        ? CloudRain
        : weather?.sky === "흐림" || weather?.sky === "구름많음"
          ? Cloud
          : SunMoon;
  if (!target) return null;
  return createPortal(
    <span className="weather-chip weather-chip--forecast" role="status">
      <Icon size={15} aria-hidden="true" />
      {weatherChipText(festival?.sigunguName ?? "서울", skyText, weather)}
    </span>,
    target,
  );
}
