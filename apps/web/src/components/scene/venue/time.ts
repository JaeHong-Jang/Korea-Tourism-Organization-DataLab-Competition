// 행사 당일 슬라이더 시각을 현지 해 위치와 인형 규모에 연결한다.
import SunCalc from "suncalc";
import type { VenueEvent } from "./sites";

export type VenueSky = "day" | "dusk" | "night";

// 한국 행사 날짜의 같은 달력날 시각을 명시적인 한국 표준시로 만든다.
export function venueDate(startsAt: string, hour: number): Date {
  return new Date(
    `${startsAt.slice(0, 10)}T${String(hour).padStart(2, "0")}:00:00+09:00`,
  );
}

// 태양 고도는 문서의 낮·노을·밤 경계와 똑같이 판정한다.
export function venueSun(
  event: VenueEvent,
  hour: number,
): { sky: VenueSky; altitude: number; azimuth: number } {
  const { altitude, azimuth } = SunCalc.getPosition(
    venueDate(event.startsAt, hour),
    event.venue.lat,
    event.venue.lng,
  );
  const degrees = (altitude * 180) / Math.PI;
  return {
    sky: degrees > 6 ? "day" : degrees > -6 ? "dusk" : "night",
    altitude,
    azimuth,
  };
}

// 예보서의 시간대 가정을 그대로 사용하고 견본은 고정 규모를 쓴다.
export function dollCount(
  peak: number,
  hour: number,
  profile: { hour: number; share: number }[],
  quality: "high" | "medium" | "low",
): { count: number; peoplePerDoll: number } {
  const peoplePerDoll = 100;
  const share =
    profile.find((point) => point.hour === hour)?.share ??
    (profile.length ? 0 : 0.4);
  const cap = quality === "high" ? 500 : quality === "medium" ? 250 : 125;
  return {
    count: Math.min(
      cap,
      Math.max(0, Math.round((peak * share) / peoplePerDoll)),
    ),
    peoplePerDoll,
  };
}
