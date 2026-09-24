// 진단 화면에서만 계약 견본을 바탕으로 30건의 행사 카드를 만든다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import card from "../../../../../packages/contracts/fixtures/festival-summary/valid-card.json";

const places = [
  { code: "11110", name: "서울 종로구", lat: 37.57, lng: 126.98 },
  { code: "26110", name: "부산 중구", lat: 35.1, lng: 129.03 },
  { code: "28110", name: "인천 중구", lat: 37.49, lng: 126.58 },
  { code: "41111", name: "경기 수원시 장안구", lat: 37.3, lng: 127.01 },
  { code: "50110", name: "제주 제주시", lat: 33.5, lng: 126.53 },
  { code: "51110", name: "강원 춘천시", lat: 37.88, lng: 127.73 },
] as const;
const types = ["불꽃", "공연", "대학", "먹거리", "꽃", "전통", "기타"] as const;

// 진단 시각부터 하루 한 건씩 배치해 필터별 수를 눈으로 확인할 수 있게 한다.
export function sceneFestivals(today: string): FestivalSummary[] {
  const base = new Date(`${today}T12:00:00+09:00`);
  return Array.from({ length: 30 }, (_, index) => {
    const day = new Date(base);
    day.setUTCDate(base.getUTCDate() + index);
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(day);
    const place = places[index % places.length];
    const peakP50 = 1000 + index * 100;
    return {
      ...card,
      eventId: `e-scene-${index + 1}`,
      forecastId: `f-scene-${index + 1}`,
      name: `견본 행사 ${index + 1}`,
      type: types[index % types.length],
      startsAt: `${date}T19:00:00+09:00`,
      endsAt: `${date}T21:00:00+09:00`,
      sigunguCode: place.code,
      sigunguName: place.name,
      lat: place.lat,
      lng: place.lng,
      level: (index % 4) + 1,
      peakP10: peakP50 - 300,
      peakP50,
      peakP90: peakP50 + 500,
      pOver1000: (index % 10) / 10,
    } as FestivalSummary;
  });
}
