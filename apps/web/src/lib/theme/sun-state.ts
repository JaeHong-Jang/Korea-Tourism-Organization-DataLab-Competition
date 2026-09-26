// 서울의 실제 해 고도로 낮·노을·밤을 나눈다.
import SunCalc from "suncalc";

export type SkyState = "day" | "dusk" | "night";
export type ThemeChoice = "auto" | "day" | "night";

const SEOUL_LATITUDE = 37.5665;
const SEOUL_LONGITUDE = 126.978;
const SIX_DEGREES = (Math.PI / 180) * 6;

// 실제 날짜와 서울 좌표를 받아 해 고도 기준의 상태를 돌려준다.
export function getSkyState(at: Date): SkyState {
  const altitude = SunCalc.getPosition(
    at,
    SEOUL_LATITUDE,
    SEOUL_LONGITUDE,
  ).altitude;
  if (altitude > SIX_DEGREES) return "day";
  if (altitude > -SIX_DEGREES) return "dusk";
  return "night";
}

// 자동은 해 상태를 따르고 수동 선택은 명시한 테마로 표시한다.
export function getTheme(choice: ThemeChoice, sky: SkyState): "day" | "night" {
  return choice === "auto" ? (sky === "night" ? "night" : "day") : choice;
}

// URLSearchParams가 더하기를 공백으로 바꾼 시간대 표기를 복원한다.
export function getDemoTime(search: string): Date | null {
  const raw = new URLSearchParams(search).get("at");
  if (!raw) return null;
  const at = new Date(raw.replace(/ ([0-9]{2}:[0-9]{2})$/, "+$1"));
  return Number.isNaN(at.getTime()) ? null : at;
}

// 데모 URL의 테마 강제값만 받아 잘못된 값은 무시한다.
export function getDemoTheme(search: string): "day" | "night" | null {
  const value = new URLSearchParams(search).get("theme");
  return value === "day" || value === "night" ? value : null;
}
