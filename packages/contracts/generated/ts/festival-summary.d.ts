/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 미니 대한민국·행사 목록 카드 한 장
 */
export interface FestivalSummary {
  eventId: string;
  forecastId: string;
  name: string;
  type: "불꽃" | "공연" | "대학" | "먹거리" | "꽃" | "전통" | "기타";
  startsAt: string;
  endsAt: string;
  /**
   * 2025년 시군구 코드 체계(방문자 API와 같은 코드)
   */
  sigunguCode: string;
  sigunguName: string;
  lat: number;
  lng: number;
  /**
   * 1 소규모 · 2 수립 권고 · 3 수립 대상 · 4 대규모
   */
  level: number;
  peakP10: number;
  peakP50: number;
  peakP90: number;
  pOver1000: number;
  ood: boolean;
}
