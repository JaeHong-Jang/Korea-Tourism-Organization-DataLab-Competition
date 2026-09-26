// 기상청 날씨 계약을 검증하고 같은 장소·날짜의 마지막 응답을 보관한다.
import type { Weather } from "@crowdcast/contracts/types";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import commonSchema from "../../../../packages/contracts/schemas/common.schema.json";
import weatherSchema from "../../../../packages/contracts/schemas/weather.schema.json";

const ajv = new Ajv2020();
addFormats(ajv);
ajv.addSchema(commonSchema);
const validWeather = ajv.compile<Weather>(weatherSchema);

// 서로 다른 행사일의 예보가 섞이지 않도록 좌표와 한국 날짜로 캐시를 나눈다.
export function weatherCacheKey(lat: number, lng: number, at: Date): string {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
  return `crowdcast-weather:${lat.toFixed(3)}:${lng.toFixed(3)}:${day}`;
}

// 저장소가 차단된 브라우저에서도 빈 응답으로 안전하게 돌아간다.
export function cachedWeather(key: string): Weather | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return validWeather(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// API 실패에는 마지막 계약 응답을 쓰고, 없으면 효과 없는 맑은 장면을 만든다.
export async function readWeather(
  lat: number,
  lng: number,
  at: Date,
  signal?: AbortSignal,
): Promise<Weather> {
  const key = weatherCacheKey(lat, lng, at);
  try {
    const query = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      at: at.toISOString(),
    });
    const response = await fetch(`/api/weather?${query}`, { signal });
    if (!response.ok) throw new Error(`날씨 요청 ${response.status}`);
    const data: unknown = await response.json();
    if (!validWeather(data)) throw new Error("날씨 계약 불일치");
    if (data.source === "없음") return cachedWeather(key) ?? data;
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      /* 저장소 없이도 현재 응답을 쓴다. */
    }
    return data;
  } catch (reason) {
    if (signal?.aborted) throw reason;
    return (
      cachedWeather(key) ?? {
        lat,
        lng,
        at: at.toISOString(),
        sky: "맑음",
        pty: "없음",
        temp: null,
        pop: null,
        source: "없음",
        fetchedAt: null,
      }
    );
  }
}
