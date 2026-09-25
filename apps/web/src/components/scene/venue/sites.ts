// 공개 z15 행사장 타일 세 곳의 범위와 견본 행사를 정의한다.
import type { ForecastReport } from "@crowdcast/contracts/types";

export const venueSites = {
  yeongjong: {
    name: "영종 씨사이드파크",
    bbox: [126.54, 37.46, 126.63, 37.52],
    lng: 126.58,
    lat: 37.49,
    type: "불꽃",
    startsAt: "2025-10-18T19:00:00+09:00",
  },
  hangang: {
    name: "2026 서울라이트 한강 빛섬축제",
    bbox: [126.95, 37.51, 127.01, 37.55],
    lng: 126.98,
    lat: 37.53,
    type: "공연",
    startsAt: "2026-10-09T19:00:00+09:00",
  },
  suwon: {
    name: "2026 수원화성 미디어아트",
    bbox: [126.98, 37.26, 127.04, 37.3],
    lng: 127.01,
    lat: 37.28,
    type: "전통",
    startsAt: "2026-09-25T19:00:00+09:00",
  },
} as const;

export type VenueKey = keyof typeof venueSites;

// 타일 전체가 아니라 행사 좌표가 들어가는 시범 범위만 고른다.
export function venueFor(lng: number, lat: number): VenueKey | null {
  for (const key of Object.keys(venueSites) as VenueKey[]) {
    const [west, south, east, north] = venueSites[key].bbox;
    if (lng >= west && lng <= east && lat >= south && lat <= north) return key;
  }
  return null;
}

// 예보서와 개발 견본에 공통으로 사용할 최소 장면 입력을 만든다.
export type VenueEvent = Pick<
  ForecastReport["event"],
  "name" | "type" | "startsAt" | "endsAt" | "venue"
>;

export function sampleEvent(key: VenueKey): VenueEvent {
  const site = venueSites[key];
  return {
    name: site.name,
    type: site.type,
    startsAt: site.startsAt,
    endsAt: site.startsAt,
    venue: { name: site.name, lng: site.lng, lat: site.lat },
  };
}
