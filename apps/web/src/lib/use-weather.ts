// 장소와 시각 변경 시 날씨 요청을 취소하고 마지막 유효한 응답을 보여 준다.
import type { Weather } from "@crowdcast/contracts/types";
import { useEffect, useState } from "react";
import { readWeather } from "./weather";

// API를 기다리는 동안에도 장면이 렌더링되도록 빈 날씨를 허용한다.
export function useWeather(
  lat: number,
  lng: number,
  at: Date,
  enabled = true,
): Weather | null {
  const [weather, setWeather] = useState<Weather | null>(null);
  const instant = at.getTime();
  useEffect(() => {
    if (!enabled) {
      setWeather(null);
      return;
    }
    const controller = new AbortController();
    setWeather(null);
    readWeather(lat, lng, new Date(instant), controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setWeather(result);
      })
      .catch(() => {
        /* 취소한 요청은 다음 장소의 날씨를 덮지 않는다. */
      });
    return () => controller.abort();
  }, [lat, lng, instant, enabled]);
  return weather;
}
